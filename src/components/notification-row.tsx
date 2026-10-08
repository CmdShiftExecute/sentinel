"use client";

import { useRef } from "react";
import clsx from "clsx";
import { SEVERITY_LABEL, dayLabel, type NotificationItem, type Severity } from "@/lib/notifications";
import { TZ, fmtClock } from "@/lib/utils";

/** Severity to Sentinel tokens. Chip = tinted surface + coloured text, never a side stripe. */
export const SEV_CHIP: Record<Severity, string> = {
  critical: "bg-danger-surface text-danger",
  warning: "bg-warning-surface text-warning",
  notice: "bg-accent-surface text-accent",
  info: "bg-surface-elevated text-txt-secondary",
  ok: "bg-success-surface text-success",
};

export function SeverityChip({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide flex-shrink-0", SEV_CHIP[severity], className)}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** "Today 16:57", "2d ago 16:57", "Sun, 04-Oct-2026 16:57". */
export function stampOf(item: NotificationItem, nowMs: number): string {
  return `${dayLabel(item.atMs, nowMs, TZ)} ${fmtClock(item.atMs)}`;
}

interface RowProps {
  item: NotificationItem;
  unread: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/** Page row: header button, full text expands in place (grid-rows, no height animation). */
export function NotificationRow({ item, unread, expanded, onToggle }: RowProps) {
  // Full text mounts the first time a row opens and stays mounted so closing can animate;
  // a row nobody opened carries no hidden text.
  const everOpened = useRef(false);
  if (expanded) everOpened.current = true;
  return (
    <li id={item.id} className="scroll-mt-16 md:scroll-mt-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${item.id}-text`}
        className={clsx(
          "w-full text-left flex items-start gap-3 px-3 py-3 min-h-[44px] rounded transition-colors duration-150 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]",
          unread && "bg-accent-surface/40",
          item.test && "opacity-70"
        )}
      >
        <SeverityChip severity={item.severity} className="mt-0.5 w-[68px] justify-center" />
        <span className="min-w-0 flex-1">
          <span className={clsx("block text-[13px] truncate", unread ? "font-semibold text-txt-primary" : "font-medium text-txt-primary")}>
            {item.title || "(no title)"}
          </span>
          <span className="flex items-baseline gap-2 text-[12px] text-txt-secondary mt-0.5">
            <span className="truncate">{item.source}</span>
            {item.test && <span className="flex-shrink-0">test</span>}
            {!item.delivered && <span className="font-semibold text-danger flex-shrink-0">not delivered</span>}
          </span>
        </span>
        <span className="text-[12px] text-txt-secondary tabular-nums flex-shrink-0 pt-0.5">{fmtClock(item.atMs)}</span>
      </button>
      <div className="notif-expand" data-open={expanded} id={`${item.id}-text`}>
        <div className="overflow-hidden">
          {everOpened.current && (
          <pre className="mx-3 mb-2 mt-1 p-3 rounded bg-surface-elevated text-[12px] leading-relaxed text-txt-secondary whitespace-pre-wrap break-words font-body max-h-[320px] overflow-y-auto">
            {item.text}
          </pre>
          )}
        </div>
      </div>
    </li>
  );
}
