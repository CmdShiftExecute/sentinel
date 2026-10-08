"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useNotifications } from "@/hooks/use-notifications";
import { sortItems } from "@/lib/notifications";
import { TZ } from "@/lib/utils";
import { SeverityChip, stampOf } from "./notification-row";

const TRAY_LIMIT = 8;

const BADGE: Record<string, string> = {
  critical: "var(--danger)",
  warning: "var(--warning)",
};

/** Bell + tray. Click opens the tray (latest alerts in page order); the tray links to the full page.
 *  Nothing depends on hover, so it works the same on a phone. */
export function NotificationBell({ placement }: { placement: "sidebar" | "header" }) {
  const { data, error, markAllRead } = useNotifications();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = data?.unread ?? 0;
  const top = useMemo(() => sortItems(data?.items ?? [], TZ).slice(0, TRAY_LIMIT), [data]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badgeColor = (data?.unreadWorst && BADGE[data.unreadWorst]) || "var(--accent)";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={clsx(
          "relative flex items-center justify-center rounded transition-colors duration-150",
          placement === "header" ? "w-11 h-11" : "w-8 h-8",
          open ? "text-accent bg-accent-surface" : "text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 11.5V7a4.5 4.5 0 019 0v4.5l1 1.5h-11l1-1.5z" />
          <path d="M6.5 14a1.5 1.5 0 003 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-[18px] text-center tabular-nums"
            style={{ background: badgeColor, color: "var(--bg-root)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className={clsx(
            "fixed z-[60] flex flex-col max-h-[min(70vh,560px)] rounded-lg border border-line bg-surface-elevated shadow-mid animate-fade-up",
            placement === "sidebar" ? "left-[232px] top-4 w-[380px]" : "left-2 right-2 top-[52px]"
          )}
          tabIndex={-1}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-dim">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-sm font-bold text-txt-primary">Notifications</h2>
              {unread > 0 && <span className="text-[12px] text-txt-secondary">{unread} unread</span>}
            </div>
            <button
              type="button"
              onClick={() => markAllRead()}
              disabled={unread === 0}
              className="text-[12px] font-medium text-accent hover:text-accent-bright disabled:text-txt-secondary disabled:opacity-60 disabled:cursor-default px-2 py-2 -mr-2 rounded max-md:min-h-[44px]"
            >
              Mark all read
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {top.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-txt-secondary">
                {!data ? (error ? "Could not load notifications." : "Loading…")
                  : !data.configured ? "No feed is set up yet. See Notification feed in the README."
                  : data.available ? "No notifications in the last " + data.retentionDays + " days."
                  : "Waiting for the first alert."}
              </p>
            ) : (
              <ul>
                {top.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={`/notifications#${it.id}`}
                      className={clsx(
                        "flex items-start gap-3 px-4 py-3 min-h-[44px] hover:bg-surface-hover transition-colors duration-150",
                        it.atMs > (data?.lastSeen ?? 0) && "bg-accent-surface/40"
                      )}
                    >
                      <SeverityChip severity={it.severity} className="mt-0.5 w-[68px] justify-center" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium text-txt-primary truncate">{it.title || "(no title)"}</span>
                        <span className="block text-[12px] text-txt-secondary mt-0.5">{stampOf(it, data?.now ?? Date.now())}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-2 border-t border-line-dim">
            <Link
              href="/notifications"
              className="flex items-center justify-center gap-1.5 w-full py-3 rounded text-[12px] font-semibold text-accent bg-accent-surface hover:bg-surface-hover transition-colors duration-150"
            >
              Open notification center
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
