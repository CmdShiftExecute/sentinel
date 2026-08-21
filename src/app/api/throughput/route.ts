import { NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";

// Minimal high-frequency throughput endpoint for the live 60s network graph.
// Reads /proc/net/dev only — cheap enough to poll every 2 seconds.

let iface = "";
let prevRx = 0;
let prevTx = 0;
let prevTime = 0;

function defaultIface(): string {
  try {
    const route = fs.readFileSync("/proc/net/route", "utf-8");
    for (const line of route.split("\n").slice(1)) {
      const p = line.split(/\s+/);
      if (p.length > 1 && p[1] === "00000000") return p[0];
    }
  } catch { /* fall through */ }
  return "";
}

export async function GET() {
  if (!iface) iface = defaultIface();
  let rxBytes = 0;
  let txBytes = 0;
  try {
    const dev = fs.readFileSync("/proc/net/dev", "utf-8");
    for (const line of dev.split("\n")) {
      if (line.trim().startsWith(iface + ":")) {
        const parts = line.split(":")[1].trim().split(/\s+/);
        rxBytes = parseInt(parts[0]) || 0;
        txBytes = parseInt(parts[8]) || 0;
      }
    }
  } catch { /* leave zeros */ }

  const now = Date.now();
  const dt = prevTime > 0 ? (now - prevTime) / 1000 : 0;
  const rxRate = dt > 0 && prevRx > 0 ? Math.max(0, (rxBytes - prevRx) / dt) : 0;
  const txRate = dt > 0 && prevTx > 0 ? Math.max(0, (txBytes - prevTx) / dt) : 0;
  prevRx = rxBytes;
  prevTx = txBytes;
  prevTime = now;

  return NextResponse.json({
    ts: now,
    interface: iface,
    rxRate: Math.round(rxRate),
    txRate: Math.round(txRate),
  });
}
