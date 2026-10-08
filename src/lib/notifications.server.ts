import fs from "fs";
import path from "path";
import { loadConfig } from "./config";
import {
  countBySeverity, groupByDay, parseFeed, worstSeverity,
  type NotificationItem, type Severity,
} from "./notifications";

const TAIL_BYTES = 4 * 1024 * 1024;

export interface NotificationsPayload {
  /** A feed path is set. */
  configured: boolean;
  /** The feed file exists and was read. */
  available: boolean;
  items: NotificationItem[];
  /** The same days and order the page shows, as ids into `items`, so another front end
   *  (a second dashboard) renders the labels without re-implementing the date rules. */
  groups: { key: string; label: string; ids: string[] }[];
  unread: number;
  unreadWorst: Severity | null;
  counts: Record<Severity, number>;
  lastSeen: number;
  now: number;
  retentionDays: number;
  skipped: number;
}

function feedPath(): string {
  const p = process.env.SENTINEL_NOTIFICATIONS_FEED || loadConfig().notifications.feedPath;
  return p ? path.resolve(process.cwd(), p) : "";
}

function statePath(): string {
  return process.env.SENTINEL_NOTIFICATIONS_STATE || path.join(process.cwd(), ".sentinel-notifications-state.json");
}

/** Last TAIL_BYTES of a file; the first partial line is dropped when it was cut. */
function readTail(file: string): string {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf-8");
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}

export function readLastSeen(): number {
  try {
    const v = JSON.parse(fs.readFileSync(statePath(), "utf-8")).lastSeen;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function markAllRead(nowMs = Date.now()): number {
  const tmp = `${statePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ lastSeen: nowMs }));
  fs.renameSync(tmp, statePath());
  return nowMs;
}

/** Throws only when the feed exists but cannot be read; the route turns that into a 503. */
export function loadNotifications(nowMs = Date.now()): NotificationsPayload {
  const cfg = loadConfig().notifications;
  const file = feedPath();
  const lastSeen = readLastSeen();
  const empty: NotificationsPayload = {
    configured: !!file, available: false, items: [], groups: [], unread: 0, unreadWorst: null,
    counts: countBySeverity([]), lastSeen, now: nowMs, retentionDays: cfg.retentionDays, skipped: 0,
  };
  if (!file || !fs.existsSync(file)) return empty;

  let raw = "";
  const older = `${file}.1`;
  if (fs.existsSync(older)) raw += readTail(older) + "\n";
  raw += readTail(file);

  const { items: all, skipped } = parseFeed(raw);
  const cutoff = nowMs - cfg.retentionDays * 86_400_000;
  const items = all
    .filter((i) => i.atMs >= cutoff && cfg.channels.includes(i.channel))
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, cfg.maxItems);
  const unreadItems = items.filter((i) => i.atMs > lastSeen);
  const tz = process.env.NEXT_PUBLIC_SENTINEL_TZ || undefined;
  return {
    configured: true, available: true, items,
    groups: groupByDay(items, nowMs, tz).map((g) => ({ key: g.key, label: g.label, ids: g.items.map((i) => i.id) })),
    unread: unreadItems.length, unreadWorst: worstSeverity(unreadItems),
    counts: countBySeverity(items), lastSeen, now: nowMs, retentionDays: cfg.retentionDays, skipped,
  };
}
