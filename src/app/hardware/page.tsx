"use client";

import { useEffect, useState } from "react";
import { useSystemData } from "@/hooks/use-system-data";
import { Gauge } from "@/components/gauge";
import { StatusBadge } from "@/components/status-badge";
import {
  formatBytes,
  batteryColor,
  healthColor,
  tempColor,
  tempLabel,
} from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export default function HardwarePage() {
  const { data } = useSystemData();
  const b = data?.battery;
  const t = data?.temperature;
  const [showBattery, setShowBattery] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((cfg) => setShowBattery(cfg.hardware?.showBattery ?? true))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">Hardware</h1>

      {/* Battery Section */}
      {showBattery && <section className="space-y-3">
        <h2 className="section-label">Battery & Power</h2>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Gauge */}
          <div className="card flex flex-col items-center justify-center py-6 animate-fade-up stagger-1">
            <Gauge
              value={b?.level ?? 0}
              label="Charge"
              sublabel={b?.charging ? "Charging" : b?.powerSource}
              color={b ? batteryColor(b.level) : "var(--accent)"}
              size={160}
              strokeWidth={10}
            />
            {b?.timeRemaining && (
              <span className="text-xs text-txt-muted mt-2">
                {b.timeRemaining} remaining
              </span>
            )}
          </div>

          {/* Details Table */}
          <div className="card px-5 py-4 animate-fade-up stagger-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Detail label="Power Source" value={b?.powerSource || "—"} />
              <Detail label="Charging" value={b?.charging ? "Yes" : "No"} />
              <Detail label="Battery Health">
                <span className="data-value text-sm font-semibold" style={{ color: b ? healthColor(b.health) : undefined }}>
                  {b ? `${b.health}%` : "—"}
                </span>
              </Detail>
              <Detail label="Cycle Count" value={b ? `${b.cycleCount}` : "—"} />
              <Detail label="Design Capacity" value={b ? `${b.designCapacity} mAh` : "—"} />
              <Detail label="Current Max Capacity" value={b ? `${b.maxCapacity} mAh` : "—"} />
              <Detail label="Current Charge" value={b ? `${b.currentCapacity} mAh` : "—"} />
              <Detail label="Battery Temperature" value={b?.temperature ? `${b.temperature}°C` : "N/A"} />
            </div>
          </div>
        </div>
      </section>}

      {/* Temperature Section */}
      <section className="space-y-3">
        <h2 className="section-label">Temperature</h2>
        <div className="card px-5 py-4 animate-fade-up stagger-3">
          <div className="flex items-center gap-6">
            <div>
              <span
                className="data-value text-4xl font-bold"
                style={{ color: tempColor(t?.cpu ?? null) }}
              >
                {t?.cpu ?? "—"}
              </span>
              {t?.cpu !== null && t?.cpu !== undefined && (
                <span className="text-lg text-txt-muted ml-1">°C</span>
              )}
            </div>
            <div className="space-y-1">
              <StatusBadge
                variant={
                  !t || t.label === "Unavailable"
                    ? "neutral"
                    : t.label === "Cool" || t.label === "Normal"
                    ? "success"
                    : t.label === "Warm"
                    ? "warning"
                    : "danger"
                }
                label={t?.label || "N/A"}
              />
              <p className="text-[11px] text-txt-muted">
                {t?.label === "Unavailable"
                  ? "Install osx-cpu-temp for CPU readings"
                  : "Sensor reading from system"}
              </p>
            </div>
          </div>
          {/* Temperature scale bar */}
          {t?.cpu !== null && t?.cpu !== undefined && (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-txt-muted mb-1">
                <span>0°C</span><span>50°C</span><span>80°C</span><span>100°C</span>
              </div>
              <div className="h-2 rounded-full bg-surface-elevated overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min((t.cpu / 100) * 100, 100)}%`,
                    background: `linear-gradient(90deg, var(--accent) 0%, var(--success) 40%, var(--warning) 70%, var(--danger) 100%)`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CPU & Memory Section */}
      <section className="space-y-3">
        <h2 className="section-label">System</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CPU */}
          <div className="card px-5 py-4 animate-fade-up stagger-4">
            <h3 className="text-xs font-semibold text-txt-secondary mb-3">Processor</h3>
            <div className="space-y-3">
              <Detail label="Model" value={data?.cpu.model || "—"} />
              <Detail label="Cores" value={data ? `${data.cpu.cores}` : "—"} />
              <Detail label="Usage">
                <div className="flex items-center gap-2">
                  <span className="data-value text-sm font-semibold text-txt-primary">
                    {data?.cpu.usage ?? 0}%
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${data?.cpu.usage ?? 0}%` }}
                    />
                  </div>
                </div>
              </Detail>
              <Detail label="Architecture" value={data?.os.arch || "—"} />
            </div>
          </div>

          {/* Memory */}
          <div className="card px-5 py-4 animate-fade-up stagger-5">
            <h3 className="text-xs font-semibold text-txt-secondary mb-3">Memory</h3>
            <div className="space-y-3">
              <Detail label="Total" value={data ? formatBytes(data.memory.total) : "—"} />
              <Detail label="Used" value={data ? formatBytes(data.memory.used) : "—"} />
              <Detail label="Free" value={data ? formatBytes(data.memory.free) : "—"} />
              <Detail label="Usage">
                <div className="flex items-center gap-2">
                  <span className="data-value text-sm font-semibold text-txt-primary">
                    {data?.memory.usage ?? 0}%
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${data?.memory.usage ?? 0}%`,
                        background: (data?.memory.usage ?? 0) > 85 ? "var(--warning)" : "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              </Detail>
              {/* Swap */}
              {data?.swap && data.swap.total > 0 && (
                <>
                  <div className="border-t border-line-dim pt-3 mt-3">
                    <h4 className="text-[10px] text-txt-muted uppercase tracking-wider mb-2">Swap</h4>
                  </div>
                  <Detail label="Swap Used" value={`${formatBytes(data.swap.used)} / ${formatBytes(data.swap.total)}`} />
                  <Detail label="Swap Usage">
                    <div className="flex items-center gap-2">
                      <span className="data-value text-sm font-semibold text-txt-primary">
                        {data.swap.usage}%
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${data.swap.usage}%`,
                            background: data.swap.usage > 50 ? "var(--warning)" : "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  </Detail>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Disk Section */}
      <section className="space-y-3">
        <h2 className="section-label">Disk</h2>
        <div className="card px-5 py-4 animate-fade-up stagger-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Donut chart */}
            <div className="w-[140px] h-[140px] flex-shrink-0">
              <DiskDonut usage={data?.disk.usage ?? 0} />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-3">
              <Detail label="Mount Point" value={data?.disk.mountpoint || "/"} />
              <Detail label="Usage" value={data ? `${data.disk.usage}%` : "—"} />
              <Detail label="Total" value={data?.disk.total || "—"} />
              <Detail label="Used" value={data?.disk.used || "—"} />
              <Detail label="Free" value={data?.disk.free || "—"} />
              <Detail label="Status">
                <StatusBadge
                  variant={(data?.disk.usage ?? 0) > 90 ? "danger" : (data?.disk.usage ?? 0) > 75 ? "warning" : "success"}
                  label={(data?.disk.usage ?? 0) > 90 ? "Critical" : (data?.disk.usage ?? 0) > 75 ? "Getting Full" : "Healthy"}
                />
              </Detail>
            </div>
          </div>
        </div>
      </section>
      {/* Multiple Disks */}
      {data?.disks && data.disks.length > 1 && (
        <section className="space-y-3">
          <h2 className="section-label">All Mount Points</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-up stagger-7">
            {data.disks.map((d, i) => (
              <div key={i} className="card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="data-value text-xs font-semibold text-txt-primary">{d.mountpoint}</span>
                  <span className={`text-xs font-bold ${d.usage > 90 ? "text-danger" : d.usage > 75 ? "text-warning" : "text-success"}`}>
                    {d.usage}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${d.usage}%`,
                      background: d.usage > 90 ? "var(--danger)" : d.usage > 75 ? "var(--warning)" : "var(--accent)",
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-txt-muted">
                  <span>{d.used} used</span>
                  <span>{d.free} free</span>
                  <span>{d.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Processes */}
      <section className="space-y-3">
        <h2 className="section-label">Top Processes</h2>
        <div className="card-static overflow-hidden animate-fade-up stagger-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px]">
              <thead>
                <tr className="border-b border-line-dim">
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">Process</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated text-right">CPU %</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated text-right">MEM %</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">User</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated text-right">PID</th>
                </tr>
              </thead>
              <tbody>
                {data?.processes && data.processes.length > 0 ? (
                  data.processes.map((p, i) => (
                    <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-txt-primary">{p.name}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`data-value text-xs font-semibold ${p.cpu > 50 ? "text-danger" : p.cpu > 20 ? "text-warning" : "text-txt-secondary"}`}>
                          {p.cpu.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`data-value text-xs font-semibold ${p.memory > 50 ? "text-danger" : p.memory > 20 ? "text-warning" : "text-txt-secondary"}`}>
                          {p.memory.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-txt-muted">{p.user}</td>
                      <td className="px-4 py-2 text-right text-xs text-txt-muted data-value">{p.pid}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="px-4 py-3 text-xs text-txt-muted">{data ? "No processes" : "Loading..."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---- Disk Donut ---- */
function DiskDonut({ usage }: { usage: number }) {
  const data = [
    { name: "Used", value: usage },
    { name: "Free", value: 100 - usage },
  ];
  const usedColor = usage > 90 ? "var(--danger)" : usage > 75 ? "var(--warning)" : "var(--accent)";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={58}
          paddingAngle={2}
          dataKey="value"
          startAngle={90}
          endAngle={-270}
          strokeWidth={0}
        >
          <Cell fill={usedColor} />
          <Cell fill="var(--border-dim)" />
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            fontSize: "11px",
            color: "var(--text-primary)",
          }}
          formatter={(value: number, name: string) => [`${value}%`, name]}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
          style={{ fill: "var(--text-primary)", fontSize: "1.1rem", fontWeight: 700 }}
          className="data-value">{usage}%</text>
        <text x="50%" y="63%" textAnchor="middle" dominantBaseline="central"
          style={{ fill: "var(--text-muted)", fontSize: "0.55rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Disk</text>
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ---- Detail Row ---- */
function Detail({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-txt-muted mb-0.5">{label}</div>
      {children || <div className="data-value text-sm font-semibold text-txt-primary">{value}</div>}
    </div>
  );
}
