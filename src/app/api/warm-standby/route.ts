import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Live read on every request — never statically cached at build time.
export const dynamic = "force-dynamic";

// The Air pushes this file here at the end of every backup run (cwd = ~/sentinel under `npm start`).
const STATUS_FILE = path.join(process.cwd(), "warm-standby-status.json");
const DAY = 86400;

export async function GET() {
  try {
    const s = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    const now = Math.floor(Date.now() / 1000);
    const age = typeof s.last_epoch === "number" ? now - s.last_epoch : null;
    // Daily backup: >26h with no fresh run = a missed window; >50h = two missed.
    const stale = age !== null && age > DAY + 2 * 3600;
    const overdue = age !== null && age > 2 * DAY + 2 * 3600;
    return NextResponse.json({ present: true, ...s, age_s: age, ago: humanAge(age), stale, overdue });
  } catch {
    return NextResponse.json({ present: false });
  }
}

function humanAge(s: number | null): string {
  if (s === null) return "unknown";
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < DAY) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / DAY)}d ${Math.floor((s % DAY) / 3600)}h ago`;
}
