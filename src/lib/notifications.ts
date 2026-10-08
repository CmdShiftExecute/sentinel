/* Notification feed: shared types and pure helpers (no fs, safe in the browser).
 *
 * The feed is a JSONL file written by whatever sends your alerts (see README,
 * "Notification feed"). One object per line:
 *   {"id","at","channel","source","severity","title","text","delivered","test"}
 *
 * Day labels count CALENDAR days in the display zone, not 24-hour windows, so an
 * alert from 23:50 last night reads "1d ago" at 00:10, as a person would say it.
 */

export type Severity = "critical" | "warning" | "notice" | "info" | "ok";

/** Worst first. This is the order inside a day. */
export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "notice", "info", "ok"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  notice: "Notice",
  info: "Info",
  ok: "Resolved",
};

export interface NotificationItem {
  id: string;
  /** ISO string exactly as the sender wrote it. */
  at: string;
  /** Epoch milliseconds parsed from `at`. */
  atMs: number;
  channel: string;
  source: string;
  severity: Severity;
  title: string;
  text: string;
  /** False when the send failed and the alert never reached you. */
  delivered: boolean;
  /** A self-test or "Test" message, not a real fault. */
  test: boolean;
}

export interface DayGroup {
  key: string;
  label: string;
  items: NotificationItem[];
}

const RANK: Record<string, number> = Object.fromEntries(SEVERITY_ORDER.map((s, i) => [s, i]));

function asSeverity(v: unknown): Severity {
  return typeof v === "string" && v in RANK ? (v as Severity) : "info";
}

/** Parse JSONL. A bad line is skipped and counted, never fatal. */
export function parseFeed(raw: string): { items: NotificationItem[]; skipped: number } {
  const items: NotificationItem[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      const atMs = typeof o.at === "string" ? Date.parse(o.at) : NaN;
      if (!o || typeof o !== "object" || !Number.isFinite(atMs)) {
        skipped++;
        continue;
      }
      items.push({
        id: String(o.id ?? `${o.at}-${items.length}`),
        at: String(o.at),
        atMs,
        channel: String(o.channel ?? "notifications"),
        source: String(o.source ?? ""),
        severity: asSeverity(o.severity),
        title: String(o.title ?? ""),
        text: String(o.text ?? ""),
        delivered: o.delivered !== false,
        test: o.test === true,
      });
    } catch {
      skipped++;
    }
  }
  return { items, skipped };
}

/** "2026-10-04": the calendar day of an instant in `tz` (undefined = viewer's zone). */
export function dayKey(ms: number, tz?: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
}

/** Whole calendar days between an instant and now, in `tz`. 0 = today. */
export function dayDiff(ms: number, nowMs: number, tz?: string): number {
  const toUtcDay = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcDay(dayKey(nowMs, tz)) - toUtcDay(dayKey(ms, tz))) / 86_400_000);
}

/** "Sun, 04-Oct-2026". English names regardless of the viewer's locale. */
export function fullDayLabel(ms: number, tz?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).formatToParts(new Date(ms));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("weekday")}, ${p("day")}-${p("month")}-${p("year")}`;
}

/** Today, 1d ago, 2d ago, 3d ago, then "Sun, 04-Oct-2026" for anything older. */
export function dayLabel(ms: number, nowMs: number, tz?: string): string {
  const d = dayDiff(ms, nowMs, tz);
  if (d <= 0) return "Today";
  if (d <= 3) return `${d}d ago`;
  return fullDayLabel(ms, tz);
}

/** Day newest first, then worst severity, then newest time. */
export function sortItems(items: NotificationItem[], tz?: string): NotificationItem[] {
  return items
    .map((it) => ({ it, day: dayKey(it.atMs, tz) }))
    .sort((a, b) =>
      a.day !== b.day ? (a.day < b.day ? 1 : -1)
        : RANK[a.it.severity] !== RANK[b.it.severity] ? RANK[a.it.severity] - RANK[b.it.severity]
        : b.it.atMs - a.it.atMs)
    .map((x) => x.it);
}

export function groupByDay(items: NotificationItem[], nowMs: number, tz?: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const it of sortItems(items, tz)) {
    const key = dayKey(it.atMs, tz);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, label: dayLabel(it.atMs, nowMs, tz), items: [it] });
  }
  return groups;
}

export function countBySeverity(items: NotificationItem[]): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, warning: 0, notice: 0, info: 0, ok: 0 };
  for (const it of items) c[it.severity]++;
  return c;
}

/** Worst severity among the given items, or null when empty. */
export function worstSeverity(items: NotificationItem[]): Severity | null {
  let best: Severity | null = null;
  for (const it of items) if (best === null || RANK[it.severity] < RANK[best]) best = it.severity;
  return best;
}
