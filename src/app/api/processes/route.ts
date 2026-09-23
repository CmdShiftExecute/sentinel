import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { ProcessRow, ProcessesResponse } from "@/lib/types";

/* Task manager — every process on the box, measured NOW.
 *
 * Why this does not reuse the `ps` call behind /api/system: `ps %cpu` is the
 * process's average over its whole lifetime, so a daemon that spiked for the
 * last ten seconds still reads 0.3%. A task manager has to answer "what is
 * eating the machine right now", which needs two readings of the kernel's CPU
 * counters and the difference between them. On Linux this reads /proc
 * directly: two passes over /proc/<pid>/stat a short window apart give live
 * CPU, and /proc/<pid>/status gives resident memory and swap per process.
 *
 * Disk I/O (/proc/<pid>/io) is only readable for processes this user owns;
 * for everything else the field is null and the table renders a dash rather
 * than a zero, because "could not read" is not "did no I/O".
 *
 * macOS has no /proc, so it falls back to `ps` — lifetime CPU, no swap — and
 * says so in `source` so the UI can label it honestly.
 */

export const dynamic = "force-dynamic";

const exec = promisify(execCb);
const SAMPLE_MS = 500;
const CLK_TCK = 100; // USER_HZ on every mainstream Linux build
const PAGE = 4096;

type Snap = {
  pid: number;
  name: string;
  state: string;
  ticks: number;
  threads: number;
  uid: number;
  rss: number;
  swap: number;
  io: number | null;
  cmd: string;
};

let userCache: Map<number, string> | null = null;
function users(): Map<number, string> {
  if (userCache) return userCache;
  const m = new Map<number, string>();
  try {
    for (const line of fs.readFileSync("/etc/passwd", "utf8").split("\n")) {
      const f = line.split(":");
      if (f.length > 2) m.set(Number(f[2]), f[0]);
    }
  } catch { /* uid shown as a number instead */ }
  userCache = m;
  return m;
}

function readSafe(p: string): string | null {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function statusKb(status: string, key: string): number {
  const m = status.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
  return m ? Number(m[1]) * 1024 : 0;
}

function snapshot(): Map<number, Snap> {
  const out = new Map<number, Snap>();
  let pids: string[] = [];
  try { pids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return out; }
  for (const d of pids) {
    const stat = readSafe(`/proc/${d}/stat`);
    if (!stat) continue; // exited between readdir and read
    // comm sits in parentheses and may itself contain spaces or ')'.
    const close = stat.lastIndexOf(")");
    const name = stat.slice(stat.indexOf("(") + 1, close);
    const f = stat.slice(close + 2).split(" ");
    // f[0]=state, f[11]=utime, f[12]=stime, f[17]=num_threads, f[21]=rss pages
    const status = readSafe(`/proc/${d}/status`) ?? "";
    const uidM = status.match(/^Uid:\s+(\d+)/m);
    const ioRaw = readSafe(`/proc/${d}/io`);
    let io: number | null = null;
    if (ioRaw) {
      const r = ioRaw.match(/^read_bytes:\s+(\d+)/m);
      const w = ioRaw.match(/^write_bytes:\s+(\d+)/m);
      if (r && w) io = Number(r[1]) + Number(w[1]);
    }
    const cmd = (readSafe(`/proc/${d}/cmdline`) ?? "").replace(/\0/g, " ").trim();
    out.set(Number(d), {
      pid: Number(d),
      name,
      state: f[0],
      ticks: Number(f[11]) + Number(f[12]),
      threads: Number(f[17]) || 1,
      uid: uidM ? Number(uidM[1]) : -1,
      rss: statusKb(status, "VmRSS") || Number(f[21]) * PAGE,
      swap: statusKb(status, "VmSwap"),
      io,
      cmd,
    });
  }
  return out;
}

async function linux(): Promise<ProcessesResponse> {
  const a = snapshot();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  const b = snapshot();
  const secs = (Date.now() - t0) / 1000;
  const memTotal = os.totalmem();
  const names = users();
  const rows: ProcessRow[] = [];
  for (const s of Array.from(b.values())) {
    // Kernel threads have no command line and no resident memory: they are
    // not something a person can act on, and there are hundreds of them.
    if (!s.cmd && s.rss === 0) continue;
    const prev = a.get(s.pid);
    const dTicks = prev ? Math.max(0, s.ticks - prev.ticks) : 0;
    const ioRate = s.io != null && prev?.io != null ? Math.max(0, s.io - prev.io) / secs : null;
    rows.push({
      pid: s.pid,
      name: s.name,
      user: names.get(s.uid) ?? String(s.uid),
      state: s.state,
      // Percent of ONE core, same convention as top: a process pinning two
      // cores reads 200%.
      cpu: Math.round((dTicks / CLK_TCK / secs) * 1000) / 10,
      memPct: Math.round((s.rss / memTotal) * 1000) / 10,
      rss: s.rss,
      swap: s.swap,
      threads: s.threads,
      ioRate: ioRate == null ? null : Math.round(ioRate),
      command: s.cmd || `[${s.name}]`,
    });
  }
  return { ok: true, source: "proc", sampledMs: Math.round(secs * 1000), cores: os.cpus().length, memTotal, rows };
}

async function darwin(): Promise<ProcessesResponse> {
  let out = "";
  try { out = (await exec("ps -axwwo pid=,user=,%cpu=,%mem=,rss=,comm=", { timeout: 5000 })).stdout; } catch { /* empty */ }
  const memTotal = os.totalmem();
  const rows: ProcessRow[] = out.split("\n").filter(Boolean).map((line) => {
    const p = line.trim().split(/\s+/);
    const cmd = p.slice(5).join(" ");
    return {
      pid: Number(p[0]), user: p[1], state: "", cpu: Number(p[2]) || 0, memPct: Number(p[3]) || 0,
      rss: (Number(p[4]) || 0) * 1024, swap: null, threads: null, ioRate: null,
      name: cmd.split("/").pop() || cmd, command: cmd,
    };
  });
  return { ok: true, source: "ps", sampledMs: 0, cores: os.cpus().length, memTotal, rows };
}

export async function GET() {
  try {
    const data = os.platform() === "linux" ? await linux() : await darwin();
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e), rows: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
