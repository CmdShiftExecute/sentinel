"use client";

import { useSystemData } from "@/hooks/use-system-data";
import { StatusBadge } from "@/components/status-badge";
import { cronToHuman } from "@/lib/utils";

export default function ServicesPage() {
  const { data } = useSystemData();
  const s = data?.services;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">Services</h1>

      {/* Docker Containers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Docker Containers</h2>
          {s && (
            <span className="text-[11px] text-txt-muted">
              <span className="data-value font-semibold text-success">
                {s.docker.filter((c) => c.state === "running").length}
              </span>{" "}
              running / {s.docker.length} total
            </span>
          )}
        </div>
        <div className="card-static overflow-hidden animate-fade-up stagger-1">
          {s?.docker && s.docker.length > 0 ? (
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
                  {s.docker.map((c, i) => (
                    <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-semibold text-txt-primary">{c.name}</span>
                        <div className="text-[10px] text-txt-muted data-value">{c.id}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-txt-secondary data-value">{c.image}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          variant={
                            c.state === "running" ? "success"
                            : c.state === "paused" ? "warning"
                            : "danger"
                          }
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
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-txt-secondary mb-1">
                {s ? "No Docker containers found" : "Loading..."}
              </p>
              {s && (
                <p className="text-[11px] text-txt-muted">
                  Docker may not be installed or the daemon isn&apos;t running
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Cron Jobs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Scheduled Jobs (Cron)</h2>
          {s && (
            <span className="text-[11px] text-txt-muted">
              <span className="data-value font-semibold text-txt-primary">{s.cronJobs.length}</span> jobs
            </span>
          )}
        </div>
        <div className="card-static overflow-hidden animate-fade-up stagger-2">
          {s?.cronJobs && s.cronJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[580px]">
                <thead>
                  <tr className="border-b border-line-dim">
                    <Th>Schedule</Th>
                    <Th>Frequency</Th>
                    <Th>Command</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.cronJobs.map((job, i) => (
                    <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="data-value text-xs font-semibold text-accent bg-accent-surface px-1.5 py-0.5 rounded">
                          {job.schedule}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-txt-secondary">
                        {cronToHuman(job.schedule)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="data-value text-[11px] text-txt-secondary max-w-[400px] truncate" title={job.command}>
                          {job.command}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-txt-secondary mb-1">
                {s ? "No cron jobs found" : "Loading..."}
              </p>
              {s && (
                <p className="text-[11px] text-txt-muted">No entries in the current user&apos;s crontab</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* System Services */}
      <section className="space-y-3">
        <h2 className="section-label">System Processes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up stagger-3">
          {s?.systemServices.map((svc, i) => (
            <div key={i} className="card px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-txt-primary">{svc.name}</span>
                <StatusBadge
                  variant={svc.status === "running" ? "success" : "danger"}
                  label={svc.status}
                  pulse={svc.status === "running"}
                />
              </div>
              {svc.pid && (
                <span className="text-[10px] text-txt-muted data-value mt-1 block">PID {svc.pid}</span>
              )}
            </div>
          )) || (
            <div className="card px-4 py-3 col-span-full text-center text-sm text-txt-muted">Loading...</div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---- Table Header ---- */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">
      {children}
    </th>
  );
}
