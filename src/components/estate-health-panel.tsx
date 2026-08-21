"use client";

import useSWR from "swr";
import { useState } from "react";
import clsx from "clsx";
import {
  EstateCheck,
  EstateResponse,
  HealthState,
  STATE_META,
  STATE_RANK,
  stateOf,
  tally,
} from "@/lib/estate";

/* Estate Health — the same 45-check estate record the Pulse dashboard shows,
 * rendered for a screen that already has a lot on it.
 *
 * The layout problem this solves: the 45 checks are wildly lopsided — 33 of them
 * sit in "Scheduled jobs" and the other six groups hold 12 between them. A flat
 * list is 45 rows long and reads as one enormous group with six footnotes. So:
 *
 *   1. A verdict line answers "is anything wrong" without any scrolling.
 *   2. Anything not-fine is lifted OUT of its group into an always-visible strip,
 *      so a problem can never be hidden behind a collapsed section.
 *   3. Each group becomes one tile carrying a pip per check — 45 dots total, the
 *      whole estate legible in roughly one card of height.
 *   4. Opening a group is an accordion (one at a time) into a height-capped
 *      scroll region, so the page's height is bounded no matter what the
 *      collector emits. A group that grows to 300 checks cannot lengthen it.
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function EstateHealthPanel() {
  // 5 minutes: the collector rewrites the record every 10, so polling faster
  // only re-reads bytes that cannot have changed.
  const { data, isLoading } = useSWR<EstateResponse>("/api/estate", fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: true,
  });
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading || !data) return <PanelShell><SkeletonRows /></PanelShell>;

  // No record at all means this optional feature simply is not in use on this
  // machine, so the panel renders nothing rather than an error. That is a very
  // different thing from a record that exists and cannot be read, which is a
  // real fault and is reported below — the distinction is why the route
  // returns a specific reason instead of a bare failure.
  if (!data.ok && data.reason === "missing") return null;

  // A record that could not be read renders as an explicit unknown, never as a
  // clean estate. The reason is shown because "unreadable" and "unparseable"
  // call for different fixes.
  if (!data.ok) {
    return (
      <PanelShell>
        <div className="flex items-start gap-3 px-1">
          <IconUnknown size={18} className="text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-txt-primary">Estate health could not be read</p>
            <p className="text-xs text-txt-secondary mt-0.5">
              The check record is {data.reason ?? "unavailable"}. This is not a verdict on the estate —
              nothing was checked.
            </p>
            {data.path && (
              <p className="text-[10px] text-txt-muted data-value mt-1.5 break-all">{data.path}</p>
            )}
          </div>
        </div>
      </PanelShell>
    );
  }

  // The array is filtered, not trusted. A single malformed entry (null, or one
  // with no group) would otherwise throw inside the grouping below and blank
  // the whole panel — turning one bad row from the collector into a total loss
  // of the estate view.
  const checks: EstateCheck[] = (Array.isArray(data.checks) ? data.checks : [])
    .filter((c): c is EstateCheck => !!c && typeof c === "object")
    .map((c) => ({
      ...c,
      name: typeof c.name === "string" && c.name ? c.name : "unnamed check",
      headline: typeof c.headline === "string" ? c.headline : "",
      group: typeof c.group === "string" && c.group ? c.group : "Other",
    }));
  const count = (s: HealthState) => checks.filter((c) => stateOf(c.state) === s).length;
  const nProblem = count("problem");
  const nUnknown = count("unknown");
  const nOk = count("ok");
  const total = checks.length;

  // Group order comes from the record, with any group the collector added but
  // did not order appended rather than silently dropped.
  const ordered = Array.isArray(data.group_order) ? data.group_order : [];
  const seen = Array.from(new Set(checks.map((c) => c.group)));
  const groupNames = [...ordered.filter((g) => seen.includes(g)), ...seen.filter((g) => !ordered.includes(g))];
  const groups = groupNames.map((name) => ({ name, checks: checks.filter((c) => c.group === name) }));

  const attention = [...checks]
    .filter((c) => stateOf(c.state) !== "ok")
    .sort((a, b) => STATE_RANK[stateOf(a.state)] - STATE_RANK[stateOf(b.state)]);

  const overall = stateOf(data.overall);
  const Icon = overall === "ok" ? IconShieldOk : overall === "problem" ? IconShieldAlert : IconUnknown;
  const iconColor =
    overall === "ok" ? "var(--success)" : overall === "problem" ? "var(--danger)" : "var(--warning)";

  return (
    <PanelShell
      meta={
        <span className="flex items-center gap-2">
          {data.stale && (
            <span
              className="pill pill-warn"
              title="The collector rewrites this record every ten minutes. This copy is older than that, so the checks below describe an earlier moment."
            >
              stale
            </span>
          )}
          <span className="text-[10px] md:text-[11px] text-txt-muted data-value whitespace-nowrap">
            {data.generated_label ?? "—"}
          </span>
        </span>
      }
    >
      {/* Verdict — the answer, before any detail */}
      <div className="flex items-start gap-3">
        <Icon size={20} style={{ color: iconColor }} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm md:text-[0.9375rem] font-semibold text-txt-primary leading-snug">
            {data.headline ?? "Estate checked"}
          </p>
          <p className="text-xs text-txt-secondary mt-1">
            <span className="data-value font-semibold text-txt-primary">{total}</span>{" "}
            {total === 1 ? "check" : "checks"} across both machines
            <span className="text-txt-muted"> · </span>
            {nProblem > 0 && (
              <>
                <span className="data-value font-semibold text-danger">{nProblem}</span> needing attention
                <span className="text-txt-muted"> · </span>
              </>
            )}
            {nUnknown > 0 && (
              <>
                <span className="data-value font-semibold text-warning">{nUnknown}</span> not checked
                <span className="text-txt-muted"> · </span>
              </>
            )}
            <span className="data-value font-semibold text-success">{nOk}</span> fine
          </p>
        </div>
      </div>

      {/* Proportion bar — the same three numbers as a shape, so the balance reads
          before the digits do. Ordered fine → not checked → needs attention, so
          the green fills from the left like a completion bar and whatever is
          left over collects at the right end, severity rising as it goes. */}
      <div className="flex h-1 w-full gap-px overflow-hidden rounded-full mt-3.5" aria-hidden="true">
        {([["ok", nOk], ["unknown", nUnknown], ["problem", nProblem]] as [HealthState, number][])
          .filter(([, n]) => n > 0)
          .map(([s, n]) => (
            <span
              key={s}
              style={{ flexGrow: n, background: STATE_META[s].varName }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>

      {/* Anything not fine, lifted out of its group. Renders only when it exists,
          so a healthy estate costs zero rows. */}
      {attention.length > 0 && (
        <div className="mt-4 rounded-lg border border-line-dim overflow-hidden">
          <div className="px-3 py-1.5 bg-surface-elevated">
            <span className="section-label">Needs your eye</span>
          </div>
          <ul className="divide-y divide-line-dim">
            {attention.map((c, i) => (
              <li key={`${c.group}-${c.name}-${i}`} className="px-3 py-2 flex items-start gap-2.5">
                <Pip state={stateOf(c.state)} className="mt-1.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-txt-primary truncate" title={c.name}>
                    {c.name}
                  </p>
                  <p className="text-[11px] text-txt-secondary">{c.headline}</p>
                  {c.detail && <p className="text-[10px] text-txt-muted mt-0.5">{c.detail}</p>}
                </div>
                <span className="ml-auto text-[10px] text-txt-muted whitespace-nowrap shrink-0 hidden sm:block">
                  {c.group}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Group tiles — one per group, a pip per check */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
        {groups.map((g) => (
          <GroupTile
            key={g.name}
            name={g.name}
            checks={g.checks}
            // A group far larger than the rest spans the row rather than
            // sitting in a third of one with its pips wrapped into a block and
            // two empty cells beside it. Driven by the count, so it keeps
            // working if the collector rebalances its groups.
            wide={g.checks.length > 12}
            open={open === g.name}
            onToggle={() => setOpen(open === g.name ? null : g.name)}
          />
        ))}
      </div>

      {open && (
        <GroupDetail name={open} checks={groups.find((g) => g.name === open)?.checks ?? []} />
      )}

      <p className="text-[10px] text-txt-muted mt-3 leading-relaxed">
        Collected on this box every ten minutes
        {data.pulseUrl ? (
          <>
            {" "}and shared with{" "}
            <a
              href={data.pulseUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              Pulse <IconExternal size={9} />
            </a>
          </>
        ) : null}
        . &ldquo;Not checked&rdquo; means the check could not be run — a machine asleep, or a job that has
        not had its first run yet — not that something is broken.
      </p>
    </PanelShell>
  );
}

/* ---- Shell ---- */
function PanelShell({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <section className="card px-4 py-3.5 md:px-5 md:py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="section-label">Estate Health</h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

/* ---- One state dot. Decorative: the tally beside it carries the same fact in words. ---- */
function Pip({ state, className }: { state: HealthState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx("estate-pip", `estate-pip-${state}`, className)}
      style={{ background: STATE_META[state].varName }}
    />
  );
}

/* ---- Group tile ---- */
function GroupTile({
  name,
  checks,
  wide,
  open,
  onToggle,
}: {
  name: string;
  checks: EstateCheck[];
  wide?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const worst = checks.reduce<HealthState>(
    (acc, c) => (STATE_RANK[stateOf(c.state)] < STATE_RANK[acc] ? stateOf(c.state) : acc),
    "ok",
  );
  const id = `estate-group-${name.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className={clsx(
        "estate-tile text-left w-full rounded-lg border px-3 py-2.5 transition-colors",
        wide && "sm:col-span-2 lg:col-span-3",
        open ? "border-accent/50 bg-accent-surface" : "border-line-dim bg-surface-elevated hover:border-accent/30",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-txt-primary truncate flex-1" title={name}>
          {name}
        </span>
        <span className="data-value text-[10px] text-txt-muted tabular-nums">{checks.length}</span>
        <IconChevron
          size={13}
          className={clsx("text-txt-muted transition-transform duration-200 shrink-0", open && "rotate-180")}
        />
      </div>
      <div className="flex flex-wrap gap-1 mt-2" aria-hidden="true">
        {checks.map((c, i) => (
          <Pip key={i} state={stateOf(c.state)} />
        ))}
      </div>
      <p
        className={clsx(
          "text-[10px] mt-1.5 truncate",
          worst === "problem" ? "text-danger" : worst === "unknown" ? "text-warning" : "text-txt-muted",
        )}
      >
        {tally(checks)}
      </p>
    </button>
  );
}

/* ---- Expanded group. Height-capped on purpose: this is what keeps a
       33-check group from tripling the page. ---- */
function GroupDetail({ name, checks }: { name: string; checks: EstateCheck[] }) {
  const sorted = [...checks].sort(
    (a, b) => STATE_RANK[stateOf(a.state)] - STATE_RANK[stateOf(b.state)] || a.name.localeCompare(b.name),
  );
  const id = `estate-group-${name.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div id={id} className="mt-2 rounded-lg border border-line-dim overflow-hidden animate-fade-in">
      <div className="px-3 py-1.5 bg-surface-elevated flex items-center justify-between gap-2">
        <span className="section-label">{name}</span>
        <span className="text-[10px] text-txt-muted">{tally(checks)}</span>
      </div>
      <ul className="divide-y divide-line-dim max-h-[19rem] overflow-y-auto">
        {sorted.map((c, i) => (
          <li key={`${c.name}-${i}`} className="px-3 py-2 flex items-start gap-2.5">
            <Pip state={stateOf(c.state)} className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-txt-primary leading-snug" title={c.name}>
                {c.name}
              </p>
              <p className="text-[11px] text-txt-secondary leading-snug">{c.headline}</p>
              {c.detail && <p className="text-[10px] text-txt-muted mt-0.5 leading-snug">{c.detail}</p>}
            </div>
            {c.last_run && (
              <span className="text-[10px] text-txt-muted data-value whitespace-nowrap shrink-0 hidden sm:block">
                {c.last_run}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-56 skeleton-shimmer rounded" />
      <div className="h-3 w-72 skeleton-shimmer rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 skeleton-shimmer rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ---- Icons. Sentinel hand-rolls its SVGs (see sidebar.tsx) and carries no icon
       package; these match that 16x16 stroked house style. ---- */
type IconProps = { size: number; className?: string; style?: React.CSSProperties };
const svgBase = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconShieldOk({ size, className, style }: IconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} {...svgBase}>
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      <path d="M5.75 8l1.6 1.6 3-3.2" />
    </svg>
  );
}

function IconShieldAlert({ size, className, style }: IconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} {...svgBase}>
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      <path d="M8 5.5v3.2" />
      <path d="M8 10.9v.01" />
    </svg>
  );
}

function IconUnknown({ size, className, style }: IconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} {...svgBase}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.4 6.2a1.6 1.6 0 113.2.3c0 1-1.6 1.2-1.6 2.3" />
      <path d="M8 11.4v.01" />
    </svg>
  );
}

function IconChevron({ size, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...svgBase}>
      <path d="M3.5 6L8 10.5 12.5 6" />
    </svg>
  );
}

function IconExternal({ size, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...svgBase}>
      <path d="M6.5 3H3.5v9.5H13V9.5" />
      <path d="M9.5 2.5H13.5V6.5" />
      <path d="M13.5 2.5L7.5 8.5" />
    </svg>
  );
}
