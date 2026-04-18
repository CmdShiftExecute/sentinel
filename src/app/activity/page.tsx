"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";

interface ActivityEvent {
  id: string;
  ts: string;
  category: "login" | "update" | "service" | "vault" | "security" | "system";
  level: "info" | "warn" | "error";
  title: string;
  detail: string;
  source: string;
}

interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
}

const CATEGORIES = [
  { key: null, label: "All" },
  { key: "login", label: "Logins" },
  { key: "update", label: "Updates" },
  { key: "service", label: "Services" },
  { key: "vault", label: "Vault" },
  { key: "security", label: "Security" },
  { key: "system", label: "System" },
];

function relativeTime(isoStr: string): string {
  try {
    const dt = new Date(isoStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - dt.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "unknown";
  }
}

function categoryToColor(category: string): { border: string; text: string } {
  switch (category) {
    case "login":
      return { border: "var(--accent)", text: "var(--accent)" };
    case "update":
      return { border: "var(--success)", text: "var(--success)" };
    case "vault":
      return { border: "var(--accent-dim)", text: "var(--accent-dim)" };
    case "security":
      return { border: "var(--danger)", text: "var(--danger)" };
    case "service":
      return { border: "var(--warning)", text: "var(--warning)" };
    default:
      return { border: "var(--text-secondary)", text: "var(--text-secondary)" };
  }
}

function levelToColor(
  level: string,
  categoryColor: string
): string {
  switch (level) {
    case "error":
      return "var(--danger)";
    case "warn":
      return "var(--warning)";
    default:
      return categoryColor;
  }
}

function IconLogin({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" />
      <path d="M2.5 14.5c0-1.66 2.24-3 5.5-3s5.5 1.34 5.5 3" />
    </svg>
  );
}

function IconUpdate({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="6.5" width="11" height="7" rx="1" />
      <polyline points="8,2.5 8,4.5 6,4.5" />
      <polyline points="8,4.5 10,4.5 10,2.5" />
    </svg>
  );
}

function IconService({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="1.5" />
      <path d="M8 2.5C4.5 3.5 2.5 5.5 2.5 8c0 2.5 2 4.5 5.5 5.5" />
      <path d="M8 2.5C11.5 3.5 13.5 5.5 13.5 8c0 2.5-2 4.5-5.5 5.5" />
    </svg>
  );
}

function IconVault({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 2.5h11v10.5h-11z" />
      <line x1="2.5" y1="5" x2="13.5" y2="5" />
      <circle cx="8" cy="9" r="1.5" />
    </svg>
  );
}

function IconSecurity({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      <polyline points="6.5,8 7.5,9 9.5,7" />
    </svg>
  );
}

function IconSystem({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="12" height="9" rx="1" />
      <line x1="4" y1="13" x2="12" y2="13" />
      <line x1="6" y1="13" x2="6" y2="15" />
      <line x1="10" y1="13" x2="10" y2="15" />
    </svg>
  );
}

function getIconForCategory(category: string, size: number) {
  switch (category) {
    case "login":
      return <IconLogin size={size} />;
    case "update":
      return <IconUpdate size={size} />;
    case "service":
      return <IconService size={size} />;
    case "vault":
      return <IconVault size={size} />;
    case "security":
      return <IconSecurity size={size} />;
    case "system":
      return <IconSystem size={size} />;
    default:
      return <IconSystem size={size} />;
  }
}

function ActivitySkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="card-static px-4 py-3 flex gap-3 animate-pulse stagger-"
          style={{
            borderLeft: "3px solid var(--border-dim)",
            animationDelay: `${i * 50}ms`,
          }}
        >
          <div className="w-4 h-4 rounded bg-border-dim flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-border-dim rounded w-2/3" />
            <div className="h-3 bg-border-dim rounded w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function ActivityPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const queryParam = selectedCategory ? `category=${selectedCategory}` : "";
  const { data, isLoading, mutate } = useSWR<ActivityResponse>(
    `/api/activity?${queryParam}`,
    (url) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 1000 }
  );

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      mutate();
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [mutate]);

  const events = data?.events || [];
  const categoryStats = {
    login: events.filter((e) => e.category === "login").length,
    update: events.filter((e) => e.category === "update").length,
    service: events.filter((e) => e.category === "service").length,
    vault: events.filter((e) => e.category === "vault").length,
    security: events.filter((e) => e.category === "security").length,
    system: events.filter((e) => e.category === "system").length,
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">
        Activity Log
      </h1>

      {/* Filter tabs + refresh indicator */}
      <div className="flex items-center justify-between gap-4">
        <div className="overflow-x-auto scrollbar-thin">
          <div className="flex gap-2 pb-2">
            {CATEGORIES.map(({ key, label }) => {
              const count =
                key === null
                  ? events.length
                  : categoryStats[key as keyof typeof categoryStats];
              const active = selectedCategory === key;

              return (
                <button
                  key={key || "all"}
                  onClick={() => setSelectedCategory(key)}
                  className={clsx(
                    "px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-all duration-150",
                    active
                      ? "bg-accent-surface text-accent"
                      : "text-txt-secondary hover:text-txt-primary"
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={clsx(
                        "ml-1.5 text-[10px] px-1.5 py-0.5 rounded",
                        active ? "bg-accent text-accent-surface" : "bg-border"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {lastUpdated && (
          <div className="text-[11px] text-txt-muted whitespace-nowrap">
            Updated {relativeTime(lastUpdated.toISOString())}
          </div>
        )}
      </div>

      {/* Timeline feed */}
      <div className="space-y-2">
        {isLoading ? (
          <ActivitySkeleton />
        ) : events.length > 0 ? (
          events.map((event, i) => {
            const colors = categoryToColor(event.category);
            const borderColor = levelToColor(event.level, colors.border);

            return (
              <div
                key={event.id}
                className="card-static px-4 py-3 flex gap-3 animate-fade-up transition-all hover:shadow-md"
                style={{
                  borderLeft: `3px solid ${borderColor}`,
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <div
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: borderColor }}
                >
                  {getIconForCategory(event.category, 16)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-txt-primary truncate">
                        {event.title}
                      </p>
                      {event.detail && (
                        <p className="text-xs text-txt-muted mt-0.5 truncate">
                          {event.detail}
                        </p>
                      )}
                    </div>
                    <time
                      className="text-xs text-txt-muted whitespace-nowrap flex-shrink-0 ml-2"
                      title={new Date(event.ts).toLocaleString()}
                    >
                      {relativeTime(event.ts)}
                    </time>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card-static px-6 py-12 text-center">
            <p className="text-sm text-txt-secondary mb-1">
              No activity recorded yet
            </p>
            <p className="text-[11px] text-txt-muted">
              Events will appear as the collector runs
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
