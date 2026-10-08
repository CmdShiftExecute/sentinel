import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-notif-"));
const feed = path.join(dir, "feed.jsonl");
const NOW = Date.parse("2026-10-08T17:05:00+04:00");
const row = (id: string, iso: string, severity: string, channel = "notifications") =>
  JSON.stringify({ id, at: iso, channel, source: "t", severity, title: id, text: id, delivered: true, test: false });

fs.writeFileSync(feed, [
  row("a", "2026-10-08T09:00:00+04:00", "info"),
  row("b", "2026-10-08T08:00:00+04:00", "critical"),
  row("c", "2026-10-06T09:00:00+04:00", "ok"),
  row("d", "2026-10-02T09:00:00+04:00", "warning"),
  row("x", "2026-10-08T10:00:00+04:00", "critical", "other-bot"),
  row("r", "2026-10-08T07:00:00+04:00", "ok", "reports"),
].join("\n"));
process.env.SENTINEL_NOTIFICATIONS_FEED = feed;
process.env.SENTINEL_NOTIFICATIONS_STATE = path.join(dir, "state.json");
process.env.NEXT_PUBLIC_SENTINEL_TZ = "Etc/GMT-4";
// config comes from the working directory's sentinel.config.json; give the test its own
fs.writeFileSync(path.join(dir, "sentinel.config.json"), JSON.stringify({ notifications: { feedPath: "", channels: ["notifications"], extraChannels: ["reports"] } }));
process.chdir(dir);

const { loadNotifications, allowedChannels } = await import("../src/lib/notifications.server");

describe("payload groups", () => {
  test("labels, order and ids come from the shared day logic; other channels are dropped", () => {
    const p = loadNotifications(NOW);
    expect(p.groups.map((g) => g.label)).toEqual(["Today", "2d ago", "Fri, 02-Oct-2026"]);
    expect(p.groups[0].ids).toEqual(["b", "a"]);
    expect(p.items.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(p.groups.flatMap((g) => g.ids).sort()).toEqual(["a", "b", "c", "d"]);
    expect(p.unread).toBe(4);
    expect(p.unreadWorst).toBe("critical");
  });

  test("an extra channel is served only when asked for, and is never in the default list", () => {
    expect(allowedChannels().sort()).toEqual(["notifications", "reports"]);
    const r = loadNotifications(NOW, "reports");
    expect(r.items.map((i) => i.id)).toEqual(["r"]);
    expect(r.groups.map((g) => g.label)).toEqual(["Today"]);
    expect(loadNotifications(NOW).items.some((i) => i.id === "r")).toBe(false);
  });
});
