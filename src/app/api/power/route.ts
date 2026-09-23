import { NextResponse } from "next/server";
import fs from "fs";
import { loadConfig, type PowerConfig } from "@/lib/config";
import type { PowerResponse, PowerDay } from "@/lib/types";

/* Power and energy — read from the power sampler's files, never the sensors.
 *
 * Producer: collectors/power-sampler.py (system service node-power-sampler),
 * the only process allowed to read the root-only SMC and RAPL sensors.
 *
 *   /run/node-power/now.json          live DC-in and CPU watts, every 2 s
 *   /var/lib/node-power/minutes.jsonl one line per minute with Wh integrated
 *
 * Wall draw = measured DC-in / configured supply efficiency, and every
 * response says so, because the wall figure is an estimate and the DC figure
 * is a measurement.
 *
 * Daily consumption is computed from AVERAGE POWER over the seconds actually
 * recorded, times 24 hours. A day the sampler only saw half of is therefore
 * still a fair daily figure, and its coverage is reported beside it rather
 * than hidden — a gap is never read as zero draw.
 */

export const dynamic = "force-dynamic";

const NOW = "/run/node-power/now.json";
const MINUTES = "/var/lib/node-power/minutes.jsonl";
const STALE_S = 15;
const KEEP_S = 31 * 86400;

type Min = { ts: number; secs: number; dc_avg?: number; dc_max?: number; wh?: number; cpu_avg?: number };

// Incremental tail-reader: the file only grows between the sampler's daily
// prune, so each request parses just the new bytes. A shrink or a new inode
// (the prune rewrites the file) resets the cache.
let cache: { ino: number; offset: number; rows: Min[]; partial: string } = { ino: -1, offset: 0, rows: [], partial: "" };

function readMinutes(): Min[] {
  let st: fs.Stats;
  try { st = fs.statSync(MINUTES); } catch { return []; }
  if (st.ino !== cache.ino || st.size < cache.offset) cache = { ino: st.ino, offset: 0, rows: [], partial: "" };
  if (st.size > cache.offset) {
    const fd = fs.openSync(MINUTES, "r");
    try {
      const buf = Buffer.alloc(st.size - cache.offset);
      fs.readSync(fd, buf, 0, buf.length, cache.offset);
      cache.offset = st.size;
      const text = cache.partial + buf.toString("utf8");
      const lines = text.split("\n");
      cache.partial = lines.pop() ?? "";
      for (const ln of lines) {
        if (!ln.trim()) continue;
        try { cache.rows.push(JSON.parse(ln)); } catch { /* a torn line is skipped, not fatal */ }
      }
    } finally { fs.closeSync(fd); }
  }
  const cutoff = Date.now() / 1000 - KEEP_S;
  if (cache.rows.length && cache.rows[0].ts < cutoff) cache.rows = cache.rows.filter((r) => r.ts >= cutoff);
  return cache.rows;
}

/** Price of ONE extra kWh for this home: the slab the household's monthly
 *  usage lands in, plus the surcharge, plus VAT. */
function ratePerKwh(p: PowerConfig): number | null {
  const t = p.tariff;
  if (!t.slabs.length) return null;
  const used = Math.max(0, t.householdMonthlyKwh || 0);
  const slab = t.slabs.find((s) => s.upTo == null || used < s.upTo) ?? t.slabs[t.slabs.length - 1];
  return (slab.rate + (t.surcharge || 0)) * (1 + (t.vatPct || 0) / 100);
}

const tz = process.env.SENTINEL_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (ts: number) => dayFmt.format(new Date(ts * 1000));

function summarise(rows: Min[], eff: number) {
  let ws = 0, secs = 0, peak = 0;
  for (const r of rows) {
    if (r.wh == null) continue;
    ws += r.wh * 3600;
    secs += r.secs;
    if (r.dc_max != null) peak = Math.max(peak, r.dc_max);
  }
  if (!secs) return null;
  const avgW = ws / secs / eff;
  return { avgW, kwhPerDay: (avgW * 24) / 1000, peakW: peak / eff, coverageS: secs };
}

export async function GET() {
  const cfg = loadConfig().power;
  const eff = cfg.psuEfficiency > 0 && cfg.psuEfficiency <= 1 ? cfg.psuEfficiency : 0.85;
  const rate = ratePerKwh(cfg);
  const nowS = Date.now() / 1000;

  let live: PowerResponse["live"] = null;
  try {
    const n = JSON.parse(fs.readFileSync(NOW, "utf8"));
    if (n.available) {
      live = {
        ts: n.ts,
        stale: nowS - n.ts > STALE_S,
        dcW: n.dc_w,
        wallW: n.dc_w != null ? Math.round((n.dc_w / eff) * 10) / 10 : null,
        cpuW: n.cpu_w,
        source: n.source,
      };
    }
  } catch {
    return NextResponse.json(
      { ok: false, reason: "no-sampler", error: `cannot read ${NOW} — is node-power-sampler running?` },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const rows = readMinutes();
  const last24 = rows.filter((r) => r.ts >= nowS - 86400);
  const last30 = rows.filter((r) => r.ts >= nowS - 30 * 86400);
  const s24 = summarise(last24, eff);
  const s30 = summarise(last30, eff);

  // 24 h series in 5-minute buckets for the chart.
  const buckets = new Map<number, { ws: number; secs: number; max: number; cpuWs: number; cpuSecs: number }>();
  for (const r of last24) {
    if (r.wh == null) continue;
    const k = Math.floor(r.ts / 300) * 300;
    const b = buckets.get(k) ?? { ws: 0, secs: 0, max: 0, cpuWs: 0, cpuSecs: 0 };
    b.ws += r.wh * 3600; b.secs += r.secs; b.max = Math.max(b.max, r.dc_max ?? 0);
    if (r.cpu_avg != null) { b.cpuWs += r.cpu_avg * r.secs; b.cpuSecs += r.secs; }
    buckets.set(k, b);
  }
  const series = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([k, b]) => ({
    ts: k * 1000,
    wall: Math.round((b.ws / b.secs / eff) * 10) / 10,
    peak: Math.round((b.max / eff) * 10) / 10,
    cpu: b.cpuSecs ? Math.round((b.cpuWs / b.cpuSecs) * 10) / 10 : null,
  }));

  const byDay = new Map<string, Min[]>();
  for (const r of last30) { const d = dayOf(r.ts); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r); }
  const today = dayOf(nowS);
  const days: PowerDay[] = Array.from(byDay.entries()).sort().map(([date, rs]) => {
    const s = summarise(rs, eff)!;
    const kwh = s ? s.kwhPerDay : 0;
    return {
      date, partial: date === today, avgW: s ? Math.round(s.avgW * 10) / 10 : 0,
      kwh: Math.round(kwh * 1000) / 1000, cost: rate != null ? Math.round(kwh * rate * 100) / 100 : null,
      coverage: s ? Math.min(1, s.coverageS / 86400) : 0,
    };
  });
  const firstTs = rows.length ? rows[0].ts : null;

  const shape = (s: ReturnType<typeof summarise>) => s && ({
    avgW: Math.round(s.avgW * 10) / 10,
    peakW: Math.round(s.peakW * 10) / 10,
    kwhPerDay: Math.round(s.kwhPerDay * 1000) / 1000,
    costPerDay: rate != null ? Math.round(s.kwhPerDay * rate * 100) / 100 : null,
    coverageHours: Math.round((s.coverageS / 3600) * 10) / 10,
  });

  const body: PowerResponse = {
    ok: true,
    live,
    efficiency: eff,
    tariff: rate != null ? {
      currency: cfg.tariff.currency,
      ratePerKwh: Math.round(rate * 10000) / 10000,
      source: cfg.tariff.source,
      householdMonthlyKwh: cfg.tariff.householdMonthlyKwh || 0,
    } : null,
    last24h: shape(s24),
    avg30d: shape(s30),
    daysRecorded: byDay.size,
    since: firstTs,
    days,
    series,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
