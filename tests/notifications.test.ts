import { describe, expect, test } from "bun:test";
import {
  dayDiff, dayKey, dayLabel, fullDayLabel, groupByDay, parseFeed, sortItems, worstSeverity,
  SEVERITY_ORDER, type NotificationItem, type Severity,
} from "../src/lib/notifications";

const TZ = "Etc/GMT-4";
// Thu 08-Oct-2026 17:05 GST
const NOW = Date.parse("2026-10-08T17:05:00+04:00");
const at = (iso: string) => Date.parse(iso);

function item(iso: string, severity: Severity, id = iso + severity): NotificationItem {
  return { id, at: iso, atMs: at(iso), channel: "notifications", source: "t", severity, title: id, text: "", delivered: true, test: false };
}

describe("dayLabel", () => {
  test("0 to 3 calendar days back", () => {
    expect(dayLabel(at("2026-10-08T00:00:00+04:00"), NOW, TZ)).toBe("Today");
    expect(dayLabel(at("2026-10-07T23:59:59+04:00"), NOW, TZ)).toBe("1d ago");
    expect(dayLabel(at("2026-10-06T12:00:00+04:00"), NOW, TZ)).toBe("2d ago");
    expect(dayLabel(at("2026-10-05T01:00:00+04:00"), NOW, TZ)).toBe("3d ago");
  });
  test("4 or more days back shows weekday and date", () => {
    expect(dayLabel(at("2026-10-04T09:00:00+04:00"), NOW, TZ)).toBe("Sun, 04-Oct-2026");
    expect(dayLabel(at("2026-09-02T09:00:00+04:00"), NOW, TZ)).toBe("Wed, 02-Sep-2026");
  });
  test("every weekday renders as Mon to Sun", () => {
    const seen = new Set<string>();
    for (let d = 4; d < 11; d++) seen.add(fullDayLabel(NOW - d * 86_400_000, TZ).slice(0, 3));
    expect([...seen].sort()).toEqual(["Fri", "Mon", "Sat", "Sun", "Thu", "Tue", "Wed"]);
  });
  test("format is always Ddd, dd-MMM-yyyy", () => {
    for (let d = 4; d < 400; d += 7) {
      expect(fullDayLabel(NOW - d * 86_400_000, TZ)).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/);
    }
  });
});

describe("GST day boundaries", () => {
  test("23:59:59 and 00:00:00 land on different days", () => {
    expect(dayKey(at("2026-10-07T23:59:59+04:00"), TZ)).toBe("2026-10-07");
    expect(dayKey(at("2026-10-08T00:00:00+04:00"), TZ)).toBe("2026-10-08");
  });
  test("a Z timestamp converts to GST first", () => {
    // 20:30Z on 7 Oct is 00:30 GST on 8 Oct
    expect(dayKey(at("2026-10-07T20:30:00Z"), TZ)).toBe("2026-10-08");
    expect(dayDiff(at("2026-10-07T20:30:00Z"), NOW, TZ)).toBe(0);
  });
  test("randomized: diff equals the calendar gap", () => {
    for (let i = 0; i < 1000; i++) {
      const back = Math.floor(Math.random() * 40);
      const ms = NOW - back * 86_400_000 - Math.floor(Math.random() * 20 * 3_600_000);
      const want = Math.round((Date.parse(dayKey(NOW, TZ)) - Date.parse(dayKey(ms, TZ))) / 86_400_000);
      expect(dayDiff(ms, NOW, TZ)).toBe(want);
    }
  });
});

describe("ordering", () => {
  test("randomized: day desc, then severity, then time desc", () => {
    for (let n = 0; n < 200; n++) {
      const items: NotificationItem[] = [];
      for (let i = 0; i < 25; i++) {
        const ms = NOW - Math.floor(Math.random() * 6 * 86_400_000);
        const sev = SEVERITY_ORDER[Math.floor(Math.random() * 5)];
        items.push(item(new Date(ms).toISOString(), sev, `i${i}`));
      }
      const out = sortItems(items, TZ);
      expect(out.length).toBe(items.length);
      for (let i = 1; i < out.length; i++) {
        const a = out[i - 1], b = out[i];
        const da = dayKey(a.atMs, TZ), db = dayKey(b.atMs, TZ);
        expect(da >= db).toBe(true);
        if (da === db) {
          const ra = SEVERITY_ORDER.indexOf(a.severity), rb = SEVERITY_ORDER.indexOf(b.severity);
          expect(ra <= rb).toBe(true);
          if (ra === rb) expect(a.atMs >= b.atMs).toBe(true);
        }
      }
    }
  });
  test("groupByDay labels and orders groups", () => {
    const g = groupByDay([
      item("2026-10-08T09:00:00+04:00", "info"), item("2026-10-08T08:00:00+04:00", "critical"),
      item("2026-10-06T09:00:00+04:00", "ok"), item("2026-10-02T09:00:00+04:00", "warning"),
    ], NOW, TZ);
    expect(g.map((x) => x.label)).toEqual(["Today", "2d ago", "Fri, 02-Oct-2026"]);
    expect(g[0].items.map((x) => x.severity)).toEqual(["critical", "info"]);
  });
  test("worstSeverity", () => {
    expect(worstSeverity([item("2026-10-08T09:00:00+04:00", "ok"), item("2026-10-08T09:00:00+04:00", "warning")])).toBe("warning");
    expect(worstSeverity([])).toBeNull();
  });
});

describe("parseFeed", () => {
  test("skips corrupt lines and keeps the rest", () => {
    const raw = [
      JSON.stringify({ id: "a", at: "2026-10-08T09:00:00+04:00", severity: "critical", title: "x", text: "y" }),
      "{not json", "", JSON.stringify({ id: "b", at: "garbage" }),
      JSON.stringify({ id: "c", at: "2026-10-08T10:00:00+04:00", severity: "weird", delivered: false }),
    ].join("\n");
    const { items, skipped } = parseFeed(raw);
    expect(items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(skipped).toBe(2);
    expect(items[1].severity).toBe("info");
    expect(items[1].delivered).toBe(false);
  });
});
