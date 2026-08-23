import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

/* Scheduled jobs — the merged inventory of every scheduler on this box.
 *
 * Source of truth: ~/server-ops/state/scheduled-jobs.json, rewritten every ten minutes
 * by schedule-collect.timer. That collector is the only thing that merges all four
 * schedulers a Linux box like this actually runs — systemd user timers, systemd system
 * timers, crontab, and an application's own internal cron. Enumerating any one of them
 * alone reports a partial schedule while reading as authoritative, which is the same
 * failure this page's own 0.4.0 release notes describe for the crontab-only version.
 *
 * Read straight off disk rather than proxied over HTTP from the dashboard that also
 * reads it: both processes sit on this box, so a network hop would only add a failure
 * mode and a second thing to keep running. Same reasoning as /api/estate.
 *
 * Failure contract, identical to /api/estate and for the same reason: a caller must be
 * able to tell "could not read" apart from "nothing is scheduled". A missing, unreadable,
 * unparseable or wrong-shaped record returns 503 with ok:false and NEVER an
 * empty-but-successful payload — an empty success paints a box with no jobs on it, which
 * is precisely the false calm this inventory exists to prevent.
 *
 * Portability note: the path is derived from os.homedir() and the collector is optional.
 * On a machine without it, this route 503s with reason "missing" and the UI says so —
 * nothing here assumes any particular host.
 */

export const dynamic = "force-dynamic";

const RECORD = path.join(os.homedir(), "server-ops", "state", "scheduled-jobs.json");

// Cap what we are willing to parse. The record is ~47 KB; anything past 8 MB is a
// runaway writer, not a job inventory, and must not be read into memory.
const MAX_BYTES = 8 * 1024 * 1024;

type Reason = "missing" | "unreadable" | "unparseable" | "too-large" | "wrong-shape";

function fail(reason: Reason, error: string) {
  return NextResponse.json({ ok: false, reason, error }, { status: 503 });
}

export async function GET() {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(RECORD);
  } catch {
    return fail(
      "missing",
      `No record at ${RECORD}. The schedule collector may not be installed or running.`,
    );
  }
  if (stat.size > MAX_BYTES) {
    return fail("too-large", `Record is ${stat.size} bytes, past the ${MAX_BYTES}-byte ceiling.`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(RECORD, "utf8");
  } catch (err) {
    return fail("unreadable", String(err));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fail("unparseable", String(err));
  }

  const rec = parsed as {
    generated_at?: string;
    counts?: { total?: number };
    group_order?: unknown;
    jobs?: unknown;
  };
  // A truncated file parses as valid JSON often enough that shape-checking is not
  // ceremony: serving a half-written record would understate the job count silently.
  if (!rec || !Array.isArray(rec.jobs) || !Array.isArray(rec.group_order) || !rec.counts) {
    return fail("wrong-shape", "Record is missing jobs[], group_order[] or counts.");
  }

  const generated = rec.generated_at ? Date.parse(rec.generated_at) : NaN;
  const ageS = Number.isNaN(generated) ? null : Math.max(0, Math.round((Date.now() - generated) / 1000));
  // The collector runs every ten minutes; past thirty it has plainly stopped, and a
  // reader that cannot tell fresh from frozen presents a stale schedule as current.
  const stale = ageS !== null && ageS > 1800;

  return NextResponse.json({ ok: true, age_s: ageS, stale, ...rec });
}
