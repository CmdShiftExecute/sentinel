import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const ACTIVITY_FILE = join(process.cwd(), "activity.jsonl");

interface ActivityEvent {
  ts?: number | string;
  category?: string;
  [k: string]: unknown;
}

/** Epoch milliseconds for an event, or null when it carries no usable time.
 *  The collector has written `ts` as both epoch seconds and an ISO string over
 *  the file's life, so both are accepted. Instant arithmetic — no timezone. */
function tsOf(e: ActivityEvent): number | null {
  if (typeof e.ts === "number") return e.ts > 1e12 ? e.ts : e.ts * 1000;
  if (typeof e.ts === "string") {
    const t = Date.parse(e.ts);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // A non-numeric limit previously produced NaN, and slice(0, NaN) is an empty
  // array — the page would go blank instead of rejecting the bad input.
  const requested = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 500) : 300;
  const category = searchParams.get("category") || null;

  if (!existsSync(ACTIVITY_FILE)) {
    return NextResponse.json({ events: [], total: 0, available: false });
  }

  let raw: string;
  try {
    raw = readFileSync(ACTIVITY_FILE, "utf-8");
  } catch (err) {
    console.error(`[activity] could not read ${ACTIVITY_FILE}: ${err}`);
    return NextResponse.json({ events: [], total: 0, available: false, error: "unreadable" }, { status: 503 });
  }

  // Parsed per line. A single malformed line used to throw out of the map and
  // take the entire feed with it, so one bad write blanked the page.
  const events: ActivityEvent[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") events.push(parsed as ActivityEvent);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  const filtered = category ? events.filter((e) => e.category === category) : events;

  // Sorted explicitly, newest first. This used to trust the file to already be
  // in that order — true today, but nothing enforced it, so a change in the
  // collector's write order would have shown stale events as "recent" with no
  // error anywhere. Events with no parseable time sort last rather than
  // being dropped.
  const sorted = [...filtered].sort((a, b) => {
    const ta = tsOf(a);
    const tb = tsOf(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });

  return NextResponse.json({
    events: sorted.slice(0, limit),
    // The number of events matching the filter, not the size of the page —
    // the old value reported the slice back as if it were the total.
    total: filtered.length,
    returned: Math.min(limit, sorted.length),
    available: true,
    ...(skipped > 0 ? { skippedMalformed: skipped } : {}),
  });
}
