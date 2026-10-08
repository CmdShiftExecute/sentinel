"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNotifications } from "@/hooks/use-notifications";
import {
  SEVERITY_LABEL, SEVERITY_ORDER, countBySeverity, groupByDay, type Severity,
} from "@/lib/notifications";
import { TZ } from "@/lib/utils";
import { NotificationRow, SEV_CHIP } from "@/components/notification-row";

export default function NotificationsPage() {
  const { data, error, isLoading, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<Set<Severity>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  const items = data?.items ?? [];
  const nowMs = data?.now ?? Date.now();
  const lastSeen = data?.lastSeen ?? 0;
  const counts = useMemo(() => countBySeverity(items), [items]);
  const shown = useMemo(() => (filter.size ? items.filter((i) => filter.has(i.severity)) : items), [items, filter]);
  const groups = useMemo(() => groupByDay(shown, nowMs, TZ), [shown, nowMs]);

  // Arriving from a tray row (#id): open that item and bring it into view.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !items.some((i) => i.id === id)) return;
    setOpen((s) => (s.has(id) ? s : new Set(s).add(id)));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "center" }));
    // run once per data arrival of that id, not on every poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.available]);

  const toggleFilter = (s: Severity) =>
    setFilter((cur) => {
      const n = new Set(cur);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  const toggleOpen = (id: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="max-w-[860px]">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-txt-primary">Notifications</h1>
          <p className="text-[12px] text-txt-secondary mt-1">
            Every alert your server sent you, by day, worst first. Kept {data?.retentionDays ?? 30} days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => markAllRead()}
          disabled={!data || data.unread === 0}
          className="px-3 py-2.5 max-md:min-h-[44px] rounded text-[12px] font-semibold text-accent bg-accent-surface hover:bg-surface-hover disabled:text-txt-secondary disabled:opacity-60 disabled:bg-surface-elevated disabled:cursor-default transition-colors duration-150"
        >
          Mark all read{data && data.unread > 0 ? ` (${data.unread})` : ""}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5" role="group" aria-label="Filter by severity">
        {SEVERITY_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleFilter(s)}
            aria-pressed={filter.has(s)}
            disabled={counts[s] === 0}
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-2 max-md:min-h-[44px] rounded text-[12px] font-semibold transition-colors duration-150 border",
              filter.has(s) ? `${SEV_CHIP[s]} border-current` : "border-line-dim text-txt-secondary hover:bg-surface-hover",
              counts[s] === 0 && "opacity-40 cursor-default hover:bg-transparent"
            )}
          >
            {SEVERITY_LABEL[s]}
            <span className="tabular-nums opacity-80">{counts[s]}</span>
          </button>
        ))}
        {filter.size > 0 && (
          <button type="button" onClick={() => setFilter(new Set())} className="px-3 py-2 max-md:min-h-[44px] text-[12px] text-txt-secondary hover:text-txt-primary">
            Clear
          </button>
        )}
      </div>

      {error && data && (
        <p role="status" className="mb-4 px-3 py-2 rounded text-[12px] bg-warning-surface text-warning">
          Could not refresh. Showing the last list that loaded.
        </p>
      )}

      {!data ? (
        <p className="py-16 text-center text-[12px] text-txt-secondary" role="status">
          {error ? "Could not load notifications." : isLoading ? "Loading…" : ""}
        </p>
      ) : !data.configured ? (
        <EmptyState title="No feed is set up">
          Set <code className="text-txt-secondary">notifications.feedPath</code> in <code className="text-txt-secondary">sentinel.config.json</code> to the JSONL file your alert senders append to. The README describes the format.
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState title={filter.size ? "Nothing matches this filter" : data.available ? "No notifications yet" : "Waiting for the first alert"}>
          {filter.size ? "Clear the filter to see every severity." : "New alerts appear here within 30 seconds of being sent."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`}>
              <h2 id={`day-${g.key}`} className="scroll-mt-16 md:scroll-mt-6 flex items-baseline gap-2 mb-1 px-3 font-display text-[13px] font-bold text-txt-primary">
                {g.label}
                <span className="text-[12px] font-normal text-txt-secondary tabular-nums">{g.items.length}</span>
              </h2>
              <ul className="card-static rounded-lg py-1 divide-y divide-[var(--border-dim)]">
                {g.items.map((it) => (
                  <NotificationRow
                    key={it.id}
                    item={it}
                    unread={it.atMs > lastSeen}
                    expanded={open.has(it.id)}
                    onToggle={() => toggleOpen(it.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-static rounded-lg px-6 py-12 text-center">
      <p className="font-display text-sm font-bold text-txt-primary">{title}</p>
      <p className="text-[12px] text-txt-secondary mt-2 max-w-[48ch] mx-auto leading-relaxed">{children}</p>
    </div>
  );
}
