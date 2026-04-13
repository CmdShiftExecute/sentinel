"use client";

import { useSystemData } from "@/hooks/use-system-data";
import { StatusBadge } from "@/components/status-badge";
import { gradeColor } from "@/lib/utils";
import clsx from "clsx";

export default function SecurityPage() {
  const { data } = useSystemData();
  const sec = data?.security;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">Security</h1>

      {/* Score Section */}
      <section className="space-y-3">
        <h2 className="section-label">Security Score</h2>
        <div className="card px-5 py-5 animate-fade-up stagger-1">
          <div className="flex items-center gap-6">
            {/* Grade */}
            <div className="flex flex-col items-center">
              <span
                className="data-value text-5xl font-bold leading-none"
                style={{ color: sec ? gradeColor(sec.grade) : undefined }}
              >
                {sec?.grade || "—"}
              </span>
              <span className="text-[11px] text-txt-muted mt-1">Grade</span>
            </div>
            {/* Score bar */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-txt-secondary">Overall Score</span>
                <span className="data-value text-sm font-bold text-txt-primary">{sec?.score ?? 0}/100</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${sec?.score ?? 0}%`,
                    background: sec ? gradeColor(sec.grade) : "var(--accent)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-txt-muted mt-1">
                <span>0</span>
                <span>F</span>
                <span>D</span>
                <span>C</span>
                <span>B</span>
                <span>A</span>
                <span>100</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Configuration Checks */}
      <section className="space-y-3">
        <h2 className="section-label">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-up stagger-2">
          <ConfigCheck
            label="Firewall"
            description={sec?.firewallTool || "Network firewall"}
            enabled={sec?.firewallEnabled ?? false}
          />
          <ConfigCheck
            label="SSH Key-Only Auth"
            description="Password authentication disabled"
            enabled={sec?.sshKeyOnly ?? false}
            unknown={sec?.sshKeyOnly === null}
          />
          <ConfigCheck
            label="Root Login Disabled"
            description="SSH root login blocked"
            enabled={sec?.rootLoginDisabled ?? false}
            unknown={sec?.rootLoginDisabled === null}
          />
          <ConfigCheck
            label="Auto Updates"
            description="Security patches applied automatically"
            enabled={sec?.autoUpdates ?? false}
            unknown={sec?.autoUpdates === null}
          />
        </div>
      </section>

      {/* Tool Audit */}
      <section className="space-y-3">
        <h2 className="section-label">Security Tools</h2>
        <div className="card-static overflow-hidden animate-fade-up stagger-3">
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[480px]">
            <thead>
              <tr className="border-b border-line-dim">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Tool</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Description</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {sec?.tools.map((tool, i) => (
                <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-txt-primary">{tool.name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-secondary">{tool.description}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge
                      variant={tool.installed ? "success" : "danger"}
                      label={tool.installed ? "Installed" : "Not Found"}
                    />
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-xs text-txt-muted">Loading...</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Warnings */}
      {sec && sec.warnings.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Warnings & Recommendations</h2>
          <div className="space-y-2 animate-fade-up stagger-4">
            {sec.warnings.map((w, i) => (
              <div key={i} className="card-static px-4 py-3 flex items-start gap-3">
                <span className="text-warning text-sm mt-0.5 flex-shrink-0">!</span>
                <div>
                  <p className="text-sm text-txt-primary">{w}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Sessions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Active Sessions</h2>
          {data && (
            <span className="text-[11px] text-txt-muted">
              <span className="data-value font-semibold text-txt-primary">{data.sessions?.length ?? 0}</span> active
            </span>
          )}
        </div>
        <div className="card-static overflow-hidden animate-fade-up stagger-4">
          {data?.sessions && data.sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[400px]">
                <thead>
                  <tr className="border-b border-line-dim">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">User</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Terminal</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">From</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Login Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s, i) => (
                    <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5 text-sm font-semibold text-txt-primary">{s.user}</td>
                      <td className="px-4 py-2.5 text-xs text-txt-secondary data-value">{s.terminal}</td>
                      <td className="px-4 py-2.5 text-xs text-txt-secondary data-value">{s.from}</td>
                      <td className="px-4 py-2.5 text-xs text-txt-muted">{s.loginTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-xs text-txt-muted">
              {data ? "No active sessions" : "Loading..."}
            </div>
          )}
        </div>
      </section>

      {/* Recent Logins */}
      <section className="space-y-3">
        <h2 className="section-label">Recent Logins</h2>
        <div className="card-static overflow-hidden animate-fade-up stagger-5">
          {data?.recentLogins && data.recentLogins.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[420px]">
                <thead>
                  <tr className="border-b border-line-dim">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">User</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">From</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Time</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentLogins.map((login, i) => (
                    <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5 text-sm font-semibold text-txt-primary">{login.user}</td>
                      <td className="px-4 py-2.5 text-xs text-txt-secondary data-value">{login.from}</td>
                      <td className="px-4 py-2.5 text-xs text-txt-muted">{login.time}</td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusBadge
                          variant={login.type === "success" ? "success" : "danger"}
                          label={login.type === "success" ? "OK" : "Failed"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-xs text-txt-muted">
              {data ? "No recent logins" : "Loading..."}
            </div>
          )}
        </div>
      </section>

      {/* Open Ports Summary */}
      <section className="space-y-3">
        <h2 className="section-label">Exposure</h2>
        <div className="card px-5 py-4 animate-fade-up stagger-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-txt-secondary">Open Ports</span>
              <div className="data-value text-2xl font-bold text-txt-primary">{sec?.openPortsCount ?? 0}</div>
            </div>
            <StatusBadge
              variant={
                (sec?.openPortsCount ?? 0) > 15 ? "danger"
                : (sec?.openPortsCount ?? 0) > 8 ? "warning"
                : "success"
              }
              label={
                (sec?.openPortsCount ?? 0) > 15 ? "High exposure"
                : (sec?.openPortsCount ?? 0) > 8 ? "Moderate"
                : "Minimal"
              }
            />
          </div>
          <p className="text-[11px] text-txt-muted mt-2">
            Each listening port increases the attack surface. Review open ports on the Network page.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---- Config Check Card ---- */
function ConfigCheck({ label, description, enabled, unknown }: {
  label: string; description: string; enabled: boolean; unknown?: boolean;
}) {
  return (
    <div className={clsx("card px-4 py-3.5", unknown && "opacity-60")}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-txt-primary">{label}</span>
        {unknown ? (
          <span className="text-[10px] text-txt-muted bg-surface-elevated px-1.5 py-0.5 rounded">Unknown</span>
        ) : (
          <span className={clsx("text-sm font-bold", enabled ? "text-success" : "text-danger")}>
            {enabled ? "✓" : "✗"}
          </span>
        )}
      </div>
      <p className="text-[11px] text-txt-muted">{description}</p>
    </div>
  );
}
