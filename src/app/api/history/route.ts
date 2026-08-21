import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

// Time-series history for the dashboard graphs, sampled once per minute by
// metrics-sampler.py (cron). For temperature, samples older than the
// sampler's first record are backfilled from the pre-existing 10-minute
// hw-temps.jsonl log so the 7d view has depth from day one.

const METRICS_FILE = path.join(process.cwd(), "metrics.jsonl");
const HW_TEMPS_FILE = path.join(
  os.homedir(),
  "server-ops/logs/hw-temps.jsonl"
);

const RANGES: Record<string, number> = {
  "1h": 3600,
  "6h": 6 * 3600,
  "12h": 12 * 3600,
  "24h": 24 * 3600,
  "7d": 7 * 24 * 3600,
};

const TARGET_POINTS = 240;

export interface HistorySample {
  ts: number;
  cpu: number | null;
  cores: (number | null)[];
  load1: number | null;
  mem_pct: number | null;
  mem_used: number | null;
  swap_pct: number | null;
  temp: number | null;
  temp_cores: number[];
  fan: number | null;
  power_w: number | null;
  rx_rate: number | null;
  tx_rate: number | null;
  disk_read_rate: number | null;
  disk_write_rate: number | null;
}

function readJsonl(file: string): Record<string, unknown>[] {
  try {
    return fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch {
    return [];
  }
}

function avg(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function downsample(samples: HistorySample[], target: number): HistorySample[] {
  if (samples.length <= target) return samples;
  const bucketSize = Math.ceil(samples.length / target);
  const out: HistorySample[] = [];
  for (let i = 0; i < samples.length; i += bucketSize) {
    const bucket = samples.slice(i, i + bucketSize);
    const coreCount = Math.max(...bucket.map((s) => s.cores?.length ?? 0));
    out.push({
      ts: bucket[Math.floor(bucket.length / 2)].ts,
      cpu: avg(bucket.map((s) => s.cpu)),
      cores: Array.from({ length: coreCount }, (_, c) =>
        avg(bucket.map((s) => s.cores?.[c]))
      ),
      load1: avg(bucket.map((s) => s.load1)),
      mem_pct: avg(bucket.map((s) => s.mem_pct)),
      mem_used: avg(bucket.map((s) => s.mem_used)),
      swap_pct: avg(bucket.map((s) => s.swap_pct)),
      temp: avg(bucket.map((s) => s.temp)),
      temp_cores: [],
      fan: avg(bucket.map((s) => s.fan)),
      power_w: avg(bucket.map((s) => s.power_w)),
      rx_rate: avg(bucket.map((s) => s.rx_rate)),
      tx_rate: avg(bucket.map((s) => s.tx_rate)),
      disk_read_rate: avg(bucket.map((s) => s.disk_read_rate)),
      disk_write_rate: avg(bucket.map((s) => s.disk_write_rate)),
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") || "6h";
  const seconds = RANGES[range] ?? RANGES["6h"];
  const cutoff = Math.floor(Date.now() / 1000) - seconds;

  const raw = readJsonl(METRICS_FILE) as unknown as HistorySample[];
  let samples = raw.filter((s) => typeof s.ts === "number" && s.ts >= cutoff);

  // Backfill temperature history from the legacy 10-min hw-temps log for the
  // window before the sampler's first record.
  const firstTs = samples.length > 0 ? samples[0].ts : Math.floor(Date.now() / 1000);
  if (cutoff < firstTs - 600) {
    const legacy = readJsonl(HW_TEMPS_FILE)
      .map((r): HistorySample | null => {
        const ts = Math.floor(new Date(String(r.ts)).getTime() / 1000);
        const temps = (r.temps ?? {}) as Record<string, number>;
        if (!Number.isFinite(ts) || typeof temps.cpu_package !== "number") return null;
        return {
          ts,
          cpu: null,
          cores: [],
          load1: null,
          mem_pct: null,
          mem_used: null,
          swap_pct: null,
          temp: temps.cpu_package,
          temp_cores: [],
          fan: typeof temps.fan_rpm === "number" ? temps.fan_rpm : null,
          power_w: null,
          rx_rate: null,
          tx_rate: null,
          disk_read_rate: null,
          disk_write_rate: null,
        };
      })
      .filter((x): x is HistorySample => x !== null)
      .filter((s) => s.ts >= cutoff && s.ts < firstTs);
    samples = [...legacy, ...samples];
  }

  samples.sort((a, b) => a.ts - b.ts);

  return NextResponse.json({
    range,
    samples: downsample(samples, TARGET_POINTS),
  });
}
