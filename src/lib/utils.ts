export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

export function tempColor(celsius: number | null): string {
  if (celsius === null) return "var(--text-muted)";
  if (celsius < 50) return "var(--accent)";
  if (celsius < 65) return "var(--success)";
  if (celsius < 80) return "var(--warning)";
  return "var(--danger)";
}

export function tempLabel(celsius: number | null): string {
  if (celsius === null) return "N/A";
  if (celsius < 50) return "Cool";
  if (celsius < 65) return "Normal";
  if (celsius < 80) return "Warm";
  if (celsius < 95) return "Hot";
  return "Critical";
}

export function batteryColor(level: number): string {
  if (level > 50) return "var(--success)";
  if (level > 20) return "var(--warning)";
  return "var(--danger)";
}

export function healthColor(pct: number): string {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--warning)";
  return "var(--danger)";
}

export function scoreGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeColor(grade: string): string {
  if (grade === "A") return "var(--success)";
  if (grade === "B") return "var(--accent)";
  if (grade === "C") return "var(--warning)";
  return "var(--danger)";
}

export function cronToHuman(schedule: string): string {
  const parts = schedule.split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour, dom, mon, dow] = parts;
  if (min === "*" && hour === "*") return "Every minute";
  if (min.startsWith("*/")) return `Every ${min.slice(2)} min`;
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  if (dom === "*" && mon === "*" && dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return schedule;
}

/* ---- Time rendering ----
 *
 * Inputs are epoch milliseconds — an instant, which carries no timezone — so
 * the conversion to a human time happens exactly once, here, at the edge.
 *
 * The display zone defaults to whatever the viewing browser is set to, which
 * is right for almost everyone. Set NEXT_PUBLIC_SENTINEL_TZ to an IANA name
 * ("Europe/Berlin", "America/New_York") to pin every displayed time to one
 * zone no matter where it is read from — useful when you administer a machine
 * from another country and want a single consistent clock. Passing undefined
 * to toLocaleString means exactly "use local", so the default costs nothing.
 */
const TZ: string | undefined = process.env.NEXT_PUBLIC_SENTINEL_TZ || undefined;

/** Optional short suffix printed after a time, e.g. "CET". Empty by default,
 *  because an unexplained abbreviation is worse than no abbreviation. */
export const TZ_LABEL: string = process.env.NEXT_PUBLIC_SENTINEL_TZ_LABEL || "";

/** "19:18" — clock time only, for something happening today. */
export function fmtClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** "19:18" today, or "21 Aug, 19:18" on any other calendar day.
 *  The day comparison uses the same display zone, so a late-night time does
 *  not jump a day because the browser sits elsewhere. */
export function fmtStamp(epochMs: number): string {
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
  if (day(epochMs) === day(Date.now())) return fmtClock(epochMs);
  return new Date(epochMs).toLocaleString("en-GB", {
    timeZone: TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(",", ",");
}

/** "in 4 min" / "22 min ago" / "just now". Purely instant arithmetic. */
export function relativeTime(epochMs: number, now = Date.now()): string {
  const delta = epochMs - now;
  const abs = Math.abs(delta);
  const suffix = (s: string) => (delta >= 0 ? `in ${s}` : `${s} ago`);
  if (abs < 45_000) return "just now";
  if (abs < 3_600_000) return suffix(`${Math.round(abs / 60_000)} min`);
  if (abs < 86_400_000) {
    const h = Math.floor(abs / 3_600_000);
    const m = Math.round((abs % 3_600_000) / 60_000);
    return suffix(m > 0 ? `${h}h ${m}m` : `${h}h`);
  }
  const d = Math.floor(abs / 86_400_000);
  return suffix(`${d} ${d === 1 ? "day" : "days"}`);
}

/** Converts an ISO string that may carry a UTC "Z" into a display stamp.
 *  Returns the input untouched if it is not parseable, so a surprising value
 *  is shown as-is rather than silently replaced by a plausible wrong one. */
export function fmtFromIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fmtStamp(t) : iso;
}
