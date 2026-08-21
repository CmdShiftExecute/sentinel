import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { loadConfig } from "@/lib/config";

/* Estate health — the same 45-check record the Pulse dashboard reads.
 *
 * Source of truth: ~/server-ops/state/estate-health.json, rewritten every ten
 * minutes by estate-health.timer. One collector, many readers; Sentinel is a
 * reader and never writes it. Read straight off disk rather than proxied over
 * HTTP from Pulse: both processes sit on this box, so a network hop would only
 * add a failure mode and a second thing to keep running.
 *
 * Failure contract — the entire point of this route. A caller must be able to
 * tell "could not read" apart from "nothing is wrong", so a missing, unreadable,
 * unparseable or wrong-shaped record returns 503 with ok:false and NEVER an
 * empty-but-successful payload. An empty success would paint a clean green
 * estate, which is the exact failure this record exists to prevent.
 */

export const dynamic = "force-dynamic";

const RECORD = path.join(os.homedir(), "server-ops", "state", "estate-health.json");
const STATES = ["ok", "problem", "unknown"] as const;

// Cap the payload we are willing to parse. The record is ~13 KB; anything past
// 4 MB is a runaway writer, not a health record, and must not be read into memory.
const MAX_BYTES = 4 * 1024 * 1024;

function fail(reason: string, error: string) {
  console.error(`[estate] ${reason}: ${error}`);
  return NextResponse.json(
    { ok: false, reason, error, path: RECORD },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

export async function GET() {
  let raw: string;
  let mtimeMs: number;
  try {
    const stat = fs.statSync(RECORD);
    // isFile() also rejects a FIFO or device node left at this path, either of
    // which would otherwise block readFileSync indefinitely.
    if (!stat.isFile()) return fail("wrong-shape", `${RECORD} is not a regular file`);
    if (stat.size > MAX_BYTES) return fail("wrong-shape", `Record is ${stat.size} bytes, over the ${MAX_BYTES} limit`);
    // Captured from THIS stat rather than a second one after the read: the
    // collector rewrites this file every ten minutes, and a second stat could
    // land in the gap where the file is briefly gone and throw uncaught.
    mtimeMs = stat.mtimeMs;
    raw = fs.readFileSync(RECORD, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return fail("missing", `No estate-health record at ${RECORD}`);
    return fail("unreadable", `Could not read ${RECORD}: ${err}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fail("unparseable", `${RECORD} is not valid JSON: ${err}`);
  }

  // Shape gate. A file that parses but carries no overall state or no checks
  // array is a torn write mid-rewrite, not a healthy estate.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail("wrong-shape", "Record is not a JSON object");
  }
  const rec = parsed as Record<string, unknown>;
  if (!STATES.includes(rec.overall as (typeof STATES)[number])) {
    return fail("wrong-shape", `Record has no usable "overall" state (got ${JSON.stringify(rec.overall)})`);
  }
  if (!Array.isArray(rec.checks)) {
    return fail("wrong-shape", 'Record has no "checks" array');
  }

  // Age comes from the file's own mtime rather than a field inside it: a
  // collector that dies mid-run can leave a generated_at that still looks
  // recent. Epoch arithmetic, so no timezone is involved.
  const ageSec = Math.max(0, Math.floor((Date.now() - mtimeMs) / 1000));

  // These four keys are written AFTER the spread deliberately. Spreading last
  // would let the record's own contents overwrite this route's verdict — a
  // record containing "ok": false would be served as a failure while being
  // perfectly valid, and one containing "stale" would override the measurement.
  return NextResponse.json(
    {
      ...rec,
      ok: true,
      age_s: ageSec,
      stale: ageSec > 40 * 60,
      path: undefined,
      pulseUrl: loadConfig().estate?.pulseUrl || null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
