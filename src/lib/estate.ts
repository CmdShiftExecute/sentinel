/* Shape of the estate-health record served by /api/estate.
 *
 * Every field below the first four is optional, because the collector emits
 * different keys per check kind (a scheduled job carries `unit` and `last_run`,
 * a git check carries three commit SHAs, most checks carry neither). Nothing
 * here may be assumed present — the panel defends against every absence. */

export type HealthState = "ok" | "problem" | "unknown";

export interface EstateCheck {
  name: string;
  state: HealthState;
  headline: string;
  group: string;
  detail?: string;
  unit?: string;
  last_run?: string;
}

export interface EstateRecord {
  ok: true;
  overall: HealthState;
  headline?: string;
  generated_at?: string;
  /** Pre-formatted label written by the collector; shown verbatim. */
  generated_label?: string;
  counts?: { ok?: number; problem?: number; unknown?: number; total?: number };
  group_order?: string[];
  checks?: EstateCheck[];
  /** Seconds since the record file was last written, computed by the route. */
  age_s?: number;
  stale?: boolean;
  /** Optional cross-link to a Pulse dashboard, from local config. */
  pulseUrl?: string | null;
}

export interface EstateFailure {
  ok: false;
  reason?: string;
  error?: string;
  path?: string;
}

export type EstateResponse = EstateRecord | EstateFailure;

/** Any state the collector did not emit is treated as "unknown", never as "ok".
 *  Silently upgrading an unrecognised state to healthy is the one failure this
 *  whole record exists to prevent. */
export function stateOf(raw: unknown): HealthState {
  return raw === "ok" || raw === "problem" ? raw : "unknown";
}

/** Problems sort above things that could not be checked, which sort above fine. */
export const STATE_RANK: Record<HealthState, number> = { problem: 0, unknown: 1, ok: 2 };

/* One state, one colour, everywhere it appears — the proportion bar, the pips
 * and the counts in the verdict line all read from here.
 *
 * "not checked" is amber rather than grey. Grey was the first choice, on the
 * reasoning that an uncheckable item should not cry wolf, but at --text-muted
 * it sat too close to the card behind it: in the proportion bar it read as
 * unfilled track rather than as data, and it disagreed with the count beside
 * it, which was already amber. A fact shown twice in two colours makes the
 * reader stop and ask which one is real. Amber still reads as "look at this
 * sometime", clearly distinct from the red of something actually broken. */
export const STATE_META: Record<HealthState, { label: string; varName: string }> = {
  ok: { label: "fine", varName: "var(--success)" },
  problem: { label: "needs attention", varName: "var(--danger)" },
  unknown: { label: "not checked", varName: "var(--warning)" },
};

/** Plain-language tally for a set of checks: "3 fine, 1 not checked".
 *  Never a bare number — every figure carries its noun. */
export function tally(checks: EstateCheck[]): string {
  const n = (s: HealthState) => checks.filter((c) => stateOf(c.state) === s).length;
  const parts: string[] = [];
  if (n("problem")) parts.push(`${n("problem")} needs attention`);
  if (n("unknown")) parts.push(`${n("unknown")} not checked`);
  if (n("ok")) parts.push(`${n("ok")} fine`);
  return parts.join(", ") || "no checks";
}
