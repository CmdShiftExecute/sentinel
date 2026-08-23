/* Shape of the merged job inventory served by /api/schedule.
 *
 * The route reads a record written by an external collector — the only thing on
 * a Linux box that merges all four schedulers at once: systemd user timers,
 * systemd system timers, crontab, and an application's own internal cron.
 * Enumerating any one of them alone produces a partial schedule that still
 * reads as authoritative, which is the failure the merged record exists to end.
 *
 * Every field below `ok` is optional and nothing here is trusted: the collector
 * is a separate program on a separate release cycle, so a field it renames or
 * drops must degrade to "unknown" in the UI rather than throw and blank the
 * section. `normalizeJobs` is where that defence lives.
 *
 * Times arrive as ISO strings carrying a real offset, plus a pre-formatted
 * relative label. The absolute value is parsed to an instant and formatted at
 * the edge in the dashboard's display zone; the label is used only where there
 * is no parseable instant, since a label frozen at collection time would age
 * silently between rewrites.
 */

export type ScheduleSource = "systemd-user" | "systemd-system" | "crontab" | "pulse" | "other";

export type JobResult = "ok" | "failed" | "unknown";

export interface ScheduleJob {
  id: string;
  name: string;
  description: string;
  source: ScheduleSource;
  group: string;
  /** Raw schedule expression — a cron line or a systemd calendar/monotonic spec. */
  schedule: string;
  /** The collector's plain-English reading of `schedule`. */
  schedule_human: string;
  next_run: string | null;
  next_run_label: string | null;
  last_run: string | null;
  last_run_label: string | null;
  last_result: JobResult;
  enabled: boolean;
  unit: string | null;
}

export interface ScheduleRecord {
  ok: true;
  /** Seconds since the record was written, computed by the route. */
  age_s?: number | null;
  stale?: boolean;
  generated_at?: string;
  /** Pre-formatted label written by the collector; shown verbatim. */
  generated_label?: string;
  counts?: {
    total?: number;
    by_source?: Record<string, number>;
    by_group?: Record<string, number>;
    enabled?: number;
    failing?: number;
  };
  /** Sources the collector could not read this cycle. Named, never swallowed. */
  degraded?: unknown[];
  group_order?: string[];
  jobs?: unknown[];
}

export interface ScheduleFailure {
  ok: false;
  reason?: string;
  error?: string;
}

export type ScheduleResponse = ScheduleRecord | ScheduleFailure;

/** Short badge text per scheduler. "other" is never silently folded into one of
 *  the known four — a source this build does not recognise says so. */
export const SOURCE_LABEL: Record<ScheduleSource, string> = {
  "systemd-user": "user timer",
  "systemd-system": "system timer",
  crontab: "cron",
  pulse: "pulse",
  other: "other",
};

export function sourceOf(raw: unknown): ScheduleSource {
  return raw === "systemd-user" || raw === "systemd-system" || raw === "crontab" || raw === "pulse"
    ? raw
    : "other";
}

/** Anything the collector did not report as a clean success or an outright
 *  failure is "unknown", never upgraded to healthy. */
export function resultOf(raw: unknown): JobResult {
  return raw === "ok" || raw === "failed" ? raw : "unknown";
}

/* One result, one colour, everywhere it appears.
 *
 * "unknown" is muted rather than amber. Most unknowns here are crontab lines,
 * which publish no exit status at all — that is the mechanism being honest, not
 * a job in trouble, and painting a third of the table amber would drown the one
 * row that actually failed. Amber stays for a job that is switched off. */
export const RESULT_TEXT: Record<JobResult, string> = {
  ok: "text-success",
  failed: "text-danger",
  unknown: "text-txt-muted",
};

export const RESULT_LABEL: Record<JobResult, string> = {
  ok: "last run ok",
  failed: "last run failed",
  unknown: "result not tracked",
};

/** Filters map onto scheduling mechanisms, not onto sources one-for-one: both
 *  systemd scopes are "timers", and an app's internal cron is still cron. */
export type JobFilter = "all" | "timer" | "cron";

export function matchesFilter(source: ScheduleSource, filter: JobFilter): boolean {
  if (filter === "all") return true;
  if (filter === "timer") return source === "systemd-user" || source === "systemd-system";
  return source === "crontab" || source === "pulse";
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The array is filtered and coerced, not trusted. One malformed entry would
 *  otherwise throw inside the grouping and blank the whole section — turning a
 *  single bad row from the collector into a total loss of the schedule view. */
export function normalizeJobs(raw: unknown): ScheduleJob[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((j): j is Record<string, unknown> => !!j && typeof j === "object")
    .map((j, i) => ({
      id: str(j.id, `job-${i}`),
      name: str(j.name, "unnamed job"),
      description: str(j.description),
      source: sourceOf(j.source),
      group: str(j.group, "Other"),
      schedule: str(j.schedule),
      schedule_human: str(j.schedule_human),
      next_run: strOrNull(j.next_run),
      next_run_label: strOrNull(j.next_run_label),
      last_run: strOrNull(j.last_run),
      last_run_label: strOrNull(j.last_run_label),
      last_result: resultOf(j.last_result),
      enabled: j.enabled !== false,
      unit: strOrNull(j.unit),
    }));
}

/** Group order comes from the record; any group the collector added but did not
 *  order is appended rather than silently dropped. */
export function orderGroups(jobs: ScheduleJob[], order: unknown): string[] {
  const ordered = Array.isArray(order) ? order.filter((g): g is string => typeof g === "string") : [];
  const seen = Array.from(new Set(jobs.map((j) => j.group)));
  return [...ordered.filter((g) => seen.includes(g)), ...seen.filter((g) => !ordered.includes(g))];
}
