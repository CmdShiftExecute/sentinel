import { NextResponse } from "next/server";
import { loadNotifications, markAllRead } from "@/lib/notifications.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(loadNotifications());
  } catch (err) {
    console.error(`[notifications] could not read the feed: ${err}`);
    return NextResponse.json({ error: "unreadable" }, { status: 503 });
  }
}

/** Only one action exists: mark everything seen up to now. */
export async function POST(req: Request) {
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (body.action !== "markRead") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, lastSeen: markAllRead() });
  } catch (err) {
    console.error(`[notifications] could not save read state: ${err}`);
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }
}
