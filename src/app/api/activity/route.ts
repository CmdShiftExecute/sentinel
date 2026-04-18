import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const ACTIVITY_FILE = join(process.cwd(), "activity.jsonl");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "300"), 500);
  const category = searchParams.get("category") || null;

  if (!existsSync(ACTIVITY_FILE)) {
    return NextResponse.json({ events: [], total: 0 });
  }

  try {
    const raw = readFileSync(ACTIVITY_FILE, "utf-8");
    let events = raw
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));

    if (category) events = events.filter(e => e.category === category);

    events = events.reverse().slice(0, limit);

    return NextResponse.json({ events, total: events.length });
  } catch {
    return NextResponse.json({ events: [], total: 0 });
  }
}
