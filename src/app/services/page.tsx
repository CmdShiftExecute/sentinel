"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useSystemData } from "@/hooks/use-system-data";
import { StatusBadge } from "@/components/status-badge";
import { WarmStandbyCard } from "@/components/warm-standby-card";
import { cronToHuman, fmtStamp, relativeTime, TZ_LABEL } from "@/lib/utils";
import type { ManagedService, ScheduledJob } from "@/lib/types";

/* Services — what runs on this box, and what is scheduled to run.
 *
 * This page used to answer both questions from the wrong sources: the schedule
 * came from `crontab -l` alone, and the service list was a fixed five-item
 * array in the source. On a box that schedules almost everything through
 * systemd timers and runs fifty-odd units, that produced a page that looked
 * authoritative and was mostly wrong. Both now come from live discovery.
 */

export default function ServicesPage() {
  const { data } = useSystemData();
  const s = data?.services;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold tracking-tight title-caret">Services</h1>
        {data && (
          <span className="text-[10px] md:text-[11px] text-txt-muted data-value whitespace-nowrap">
            {fmtStamp(data.timestamp)}
          </span>
        )}
      </div>

      {/* Discovery failures are stated, never rendered as an empty list. */}
      {s?.discoveryError && (
        <div className="card-static px-4 py-2.5 border-warning/40">
          <p className="text-xs text-warning">
            <span className="font-semibold">Partial view:</span> {s.discoveryError}. What is listed
            below is real, but it is not the whole picture.
          </p>
        </div>
      )}

      <WarmStandbyCard />

      <ScheduledSection jobs={s?.scheduled} loading={!s} />
      <ServicesSection services={s?.managed} loading={!s} />
      <DockerSection data={s} />
    </div>
  );
}

/* ================= Scheduled jobs ================= */

type JobFilter = "all" | "timer" | "cron";

function ScheduledSection({ jobs, loading }: { jobs?: ScheduledJob[]; loading: boolean }) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const all = useMemo(() => jobs ?? [], [jobs]);

  const shown = useMemo(() => {
    const list = filter === "all" ? all : all.filter((j) => j.kind === filter);
    // Soonest first — an operator reads this page to find out what happens next.
    // Jobs with no computable next run (cron lines, inactive timers) sort last
    // rather than being dropped.
    return [...list].sort((a, b) => {
      if (a.nextRun === null && b.nextRun === null) return a.description.localeCompare(b.description);
      if (a.nextRun === null) return 1;
      if (b.nextRun === null) return -1;
      return a.nextRun - b.nextRun;
    });
  }, [all, filter]);

  const nTimer = all.filter((j) => j.kind === "timer").length;
  const nCron = all.filter((j) => j.kind === "cron").length;
  const nInactive = all.filter((j) => j.kind === "timer" && !j.active).length;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="section-label">Scheduled Jobs</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-txt-muted">
            <span className="data-value font-semibold text-txt-primary">{nTimer}</span> systemd{" "}
            {nTimer === 1 ? "timer" : "timers"}
            {nInactive > 0 && <span className="text-txt-muted"> ({nInactive} inactive)</span>}
            {" · "}
            <span className="data-value font-semibold text-txt-primary">{nCron}</span> cron{" "}
            {nCron === 1 ? "entry" : "entries"}
          </span>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "timer", label: "Timers" },
              { value: "cron", label: "Cron" },
            ]}
          />
        </div>
      </div>

      <div className="card-static overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} />
        ) : shown.length === 0 ? (
          <Empty
            title="No scheduled jobs found"
            hint="Neither systemd timers nor crontab entries were readable for this user."
          />
        ) : (
          // Height-capped so a box with a hundred timers cannot make this page
          // endless; the list scrolls inside the card instead.
          <div className="max-h-[26rem] overflow-y-auto overflow-x-auto">
            {/* table-fixed with declared widths, not auto layout. Under auto
                layout the Job column sized itself to the longest description
                (782px on real data), pushing the table past the card and
                scrolling "Last run" out of sight. Fixed columns make the
                overflow impossible whatever the collector emits. */}
            <table className="w-full text-left table-fixed min-w-[680px]">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[43%]" />
                <col className="w-[24%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line-dim">
                  <Th>Next run</Th>
                  <Th>Job</Th>
                  <Th>Schedule</Th>
                  <Th>Last run</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => (
                  <JobRow key={`${j.kind}-${j.scope}-${j.id}`} job={j} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-txt-muted">
        Read live from <code className="code-inline">systemctl show</code> in both the user and system
        scopes, plus <code className="code-inline">crontab</code>. All times{" "}
        {TZ_LABEL || "in the dashboard's display timezone"}.
      </p>
    </section>
  );
}

function JobRow({ job }: { job: ScheduledJob }) {
  const imminent = job.nextRun !== null && job.nextRun - Date.now() < 5 * 60_000;

  return (
    <tr className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
      <td className="px-4 py-2 whitespace-nowrap align-top">
        {job.nextRun !== null ? (
          <>
            <div
              className={clsx("data-value text-xs font-semibold", imminent ? "text-accent" : "text-txt-primary")}
            >
              {fmtStamp(job.nextRun)}
            </div>
            <div className="text-[10px] text-txt-muted">{relativeTime(job.nextRun)}</div>
          </>
        ) : job.kind === "cron" ? (
          // cron does not publish a next-fire time; saying "—" would read as
          // "never scheduled", which is the opposite of the truth.
          <span className="text-[11px] text-txt-muted" title="cron does not report a next fire time">
            on schedule
          </span>
        ) : (
          <span className="text-[11px] text-txt-muted">not scheduled</span>
        )}
      </td>
      <td className="px-4 py-2 align-top">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-txt-primary truncate min-w-0" title={job.description}>
            {job.description}
          </span>
          {!job.active && <Pill tone="warn">inactive</Pill>}
        </div>
        <div className="text-[10px] text-txt-muted data-value truncate" title={job.target}>
          {job.target || "—"}
        </div>
      </td>
      <td className="px-4 py-2 align-top">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill tone={job.kind === "timer" ? "accent" : "muted"}>{job.kind}</Pill>
          <Pill tone="muted">{job.scope}</Pill>
        </div>
        <div className="text-[10px] text-txt-muted data-value mt-0.5 truncate" title={job.schedule}>
          {job.kind === "cron" ? cronToHuman(job.schedule) : job.schedule}
        </div>
      </td>
      <td className="px-4 py-2 align-top whitespace-nowrap">
        {job.lastRun !== null ? (
          <>
            <div className="data-value text-[11px] text-txt-secondary">{fmtStamp(job.lastRun)}</div>
            <div className="text-[10px] text-txt-muted">{relativeTime(job.lastRun)}</div>
          </>
        ) : (
          <span className="text-[11px] text-txt-muted">never</span>
        )}
      </td>
    </tr>
  );
}

/* ================= Services ================= */

function ServicesSection({ services, loading }: { services?: ManagedService[]; loading: boolean }) {
  const [showSystem, setShowSystem] = useState(false);
  const all = services ?? [];

  const failed = all.filter((x) => x.state === "failed");
  const user = all.filter((x) => x.scope === "user" && x.state !== "failed");
  const system = all.filter((x) => x.scope === "system" && x.state !== "failed");

  // Pinned units (sentinel.config.json watchUnits) float to the top of their group.
  const byPin = (a: ManagedService, b: ManagedService) =>
    Number(b.pinned) - Number(a.pinned) || a.unit.localeCompare(b.unit);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="section-label">Services</h2>
        {!loading && (
          <span className="text-[11px] text-txt-muted">
            <span className="data-value font-semibold text-success">{all.length - failed.length}</span> running
            {failed.length > 0 && (
              <>
                {" · "}
                <span className="data-value font-semibold text-danger">{failed.length}</span> failed
              </>
            )}
          </span>
        )}
      </div>

      {loading ? (
        <div className="card-static"><SkeletonTable rows={4} /></div>
      ) : all.length === 0 ? (
        <div className="card-static">
          <Empty title="No services discovered" hint="systemd could not be queried for this user." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {failed.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-danger mb-1.5">Failed units</p>
              <ServiceGrid items={[...failed].sort(byPin)} />
            </div>
          )}

          <ServiceGrid items={[...user].sort(byPin)} />

          {system.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowSystem((v) => !v)}
                aria-expanded={showSystem}
                className="text-[11px] text-txt-secondary hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <span
                  className={clsx(
                    "inline-block transition-transform duration-200",
                    showSystem && "rotate-90",
                  )}
                >
                  ›
                </span>
                {showSystem ? "Hide" : "Show"} {system.length} system-scope services
              </button>
              {showSystem && (
                <div className="mt-2 animate-fade-in">
                  <ServiceGrid items={[...system].sort(byPin)} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ServiceGrid({ items }: { items: ManagedService[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((svc) => (
        <div key={`${svc.scope}-${svc.unit}`} className="card px-3 py-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs font-semibold text-txt-primary truncate"
              title={svc.unit}
            >
              {svc.unit.replace(/\.service$/, "")}
            </span>
            <StatusBadge
              variant={svc.state === "failed" ? "danger" : svc.state === "running" ? "success" : "warning"}
              label={svc.state === "other" ? svc.sub : svc.state}
              pulse={svc.state === "running"}
            />
          </div>
          <p className="text-[10px] text-txt-muted mt-1 line-clamp-2 leading-snug" title={svc.description}>
            {svc.description}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Pill tone="muted">{svc.scope}</Pill>
            {svc.pinned && <Pill tone="accent">watched</Pill>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= Docker ================= */

function DockerSection({ data }: { data?: { docker: { id: string; name: string; image: string; state: string; ports: string; uptime: string }[] } }) {
  const docker = data?.docker;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="section-label">Docker Containers</h2>
        {docker && (
          <span className="text-[11px] text-txt-muted">
            <span className="data-value font-semibold text-success">
              {docker.filter((c) => c.state === "running").length}
            </span>{" "}
            running / {docker.length} total
          </span>
        )}
      </div>
      <div className="card-static overflow-hidden">
        {docker && docker.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[580px]">
              <thead>
                <tr className="border-b border-line-dim">
                  <Th>Name</Th>
                  <Th>Image</Th>
                  <Th>Status</Th>
                  <Th>Ports</Th>
                  <Th>Uptime</Th>
                </tr>
              </thead>
              <tbody>
                {docker.map((c, i) => (
                  <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-semibold text-txt-primary">{c.name}</span>
                      <div className="text-[10px] text-txt-muted data-value">{c.id}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-txt-secondary data-value">{c.image}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        variant={c.state === "running" ? "success" : c.state === "paused" ? "warning" : "danger"}
                        label={c.state}
                        pulse={c.state === "running"}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-txt-muted data-value max-w-[200px] truncate">
                      {c.ports || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-txt-secondary">{c.uptime || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={docker ? "No Docker containers found" : "Loading…"}
            hint={docker ? "Docker may not be installed or the daemon is not running" : undefined}
          />
        )}
      </div>
    </section>
  );
}

/* ================= Primitives ================= */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">
      {children}
    </th>
  );
}

function Pill({ tone, children }: { tone: "accent" | "muted" | "warn"; children: React.ReactNode }) {
  return <span className={clsx("pill", `pill-${tone}`)}>{children}</span>;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx("segmented-btn", value === o.value && "is-on")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-sm text-txt-secondary mb-1">{title}</p>
      {hint && <p className="text-[11px] text-txt-muted">{hint}</p>}
    </div>
  );
}

function SkeletonTable({ rows }: { rows: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-7 skeleton-shimmer rounded" />
      ))}
    </div>
  );
}
