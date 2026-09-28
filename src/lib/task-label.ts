import fs from "fs";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { loadConfig } from "@/lib/config";

/* Task labels — what a process is FOR, not what binary it runs.
 *
 * The kernel name ("node", "python3", "sh") says nothing when a dozen services
 * share one runtime. This resolves each process to a human label, first match
 * wins:
 *   1. rule      — a regex on the command line from sentinel.config.json
 *                  (processes.labels), so the owner can name anything by hand;
 *   2. pm2       — the PM2 app the process (or an ancestor) belongs to;
 *   3. container — the Docker container name, from the process's cgroup;
 *   4. unit      — the systemd unit's own Description, from the cgroup;
 *   5. process   — the kernel name, when nothing better is known.
 * Unit, container and PM2 lookups are cached for 30 s so a 0.5 s sampler does
 * not fork systemctl/docker/pm2 on every poll.
 */

const execFile = promisify(execFileCb);
const TTL_MS = 30_000;

export type LabelSource = "rule" | "pm2" | "container" | "unit" | "process";
export interface TaskLabel { label: string; source: LabelSource; unit: string | null }

interface Lookups { units: Map<string, string>; containers: Map<string, string>; pm2: Map<number, string> }
let cache: { at: number; data: Lookups } | null = null;
let inflight: Promise<Lookups> | null = null;

async function out(cmd: string, args: string[]): Promise<string> {
  try { return (await execFile(cmd, args, { timeout: 4000, maxBuffer: 8 * 1024 * 1024 })).stdout; } catch { return ""; }
}

// Descriptions come from `systemctl show`, never the list-units table: that table
// grows a JOB column while a unit is starting, which shifts every field after it.
async function unitDescriptions(scope: string[]): Promise<Map<string, string>> {
  const names = (await out("systemctl", [...scope, "list-units", "--type=service", "--all", "--no-legend", "--plain", "--no-pager"]))
    .split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((u) => u?.endsWith(".service"));
  const m = new Map<string, string>();
  if (!names.length) return m;
  let id = "";
  for (const line of (await out("systemctl", [...scope, "show", "-p", "Id", "-p", "Description", "--", ...names])).split("\n")) {
    if (line.startsWith("Id=")) id = line.slice(3);
    else if (line.startsWith("Description=") && id) m.set(id, line.slice(12).trim());
  }
  return m;
}

async function refresh(): Promise<Lookups> {
  const [sysUnits, userUnits, docker, pm2] = await Promise.all([
    unitDescriptions([]),
    unitDescriptions(["--user"]),
    out("docker", ["ps", "--no-trunc", "--format", "{{.ID}}\t{{.Names}}"]),
    out("pm2", ["jlist"]),
  ]);
  // A user unit of the same name as a system unit is the one this owner runs.
  const units = new Map<string, string>([...Array.from(sysUnits), ...Array.from(userUnits)]);
  const containers = new Map<string, string>();
  for (const line of docker.split("\n")) {
    const [id, name] = line.split("\t");
    if (id && name) containers.set(id.trim(), name.trim());
  }
  const pm2Apps = new Map<number, string>();
  try {
    // Only pid and name are read; pm2_env carries the app's environment and is never kept.
    for (const app of JSON.parse(pm2 || "[]") as { pid?: number; name?: string }[]) {
      if (app.pid && app.name) pm2Apps.set(app.pid, app.name);
    }
  } catch { /* pm2 absent or not JSON: no PM2 labels */ }
  return { units, containers, pm2: pm2Apps };
}

export async function taskLookups(): Promise<Lookups> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!inflight) {
    inflight = refresh()
      .then((data) => { cache = { at: Date.now(), data }; return data; })
      .finally(() => { inflight = null; });
  }
  // Serve the stale set while a refresh runs; block only on the very first call.
  return cache ? cache.data : inflight;
}

/** The innermost systemd unit or scope the process runs in, from /proc/<pid>/cgroup. */
export function cgroupUnit(pid: number): string | null {
  let raw = "";
  try { raw = fs.readFileSync(`/proc/${pid}/cgroup`, "utf8"); } catch { return null; }
  const segs = raw.trim().split("\n").pop()?.split("/") ?? [];
  for (let i = segs.length - 1; i >= 0; i--) {
    if (/\.(service|scope)$/.test(segs[i])) return segs[i];
  }
  return null;
}

// Units that only group other processes: their description names the container, not the task.
const GENERIC_UNIT = /^(user@\d+|pm2-.+|docker|containerd|session-\d+|init|user-runtime-dir@\d+)\.(service|scope)$/;

/** Unit descriptions often carry a long tail ("… (Next.js)", "… — serves :925"); keep the head. */
function shortDescription(d: string): string {
  const head = d.split(/\s+[—–]\s+|\s+\(|;\s/)[0].trim();
  return head || d;
}

interface Rule { match: string; label: string }
let ruleCache: { key: string; rules: { re: RegExp; label: string }[] } | null = null;
function rules(): { re: RegExp; label: string }[] {
  const raw = (loadConfig().processes?.labels ?? []) as Rule[];
  const key = JSON.stringify(raw);
  if (ruleCache?.key === key) return ruleCache.rules;
  const compiled: { re: RegExp; label: string }[] = [];
  for (const r of raw) {
    try { if (r.match && r.label) compiled.push({ re: new RegExp(r.match, "i"), label: r.label }); } catch { /* bad regex skipped */ }
  }
  ruleCache = { key, rules: compiled };
  return compiled;
}

export function labelFor(
  p: { pid: number; name: string; command: string },
  lk: Lookups,
  parentOf: (pid: number) => number | undefined,
): TaskLabel {
  const unit = cgroupUnit(p.pid);
  for (const r of rules()) {
    const m = p.command.match(r.re);
    // "$1" in a label is replaced by the rule's first capture group, so one rule can name a family.
    if (m) return { label: r.label.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? ""), source: "rule", unit };
  }

  if (lk.pm2.size) {
    let cur: number | undefined = p.pid;
    for (let hops = 0; cur && cur > 1 && hops < 12; hops++) {
      const app = lk.pm2.get(cur);
      if (app) return { label: app, source: "pm2", unit };
      cur = parentOf(cur);
    }
  }

  const docker = unit?.match(/^docker-([0-9a-f]{12,})\.scope$/);
  if (docker) {
    const name = lk.containers.get(docker[1]);
    if (name) return { label: name, source: "container", unit };
  }

  if (unit && unit.endsWith(".service") && !GENERIC_UNIT.test(unit)) {
    const desc = lk.units.get(unit);
    return { label: desc ? shortDescription(desc) : unit.replace(/\.service$/, ""), source: "unit", unit };
  }

  return { label: p.name, source: "process", unit };
}
