"use client";

import { useSystemData } from "@/hooks/use-system-data";
import { Gauge } from "@/components/gauge";
import { StatusBadge } from "@/components/status-badge";
import { formatUptime, formatBytes, batteryColor, tempColor, gradeColor } from "@/lib/utils";
import Link from "next/link";
import clsx from "clsx";
import { useState } from "react";

export default function OverviewPage() {
  const { data, isLoading } = useSystemData();

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold tracking-tight">Overview</h1>
        {data && (
          <span className="text-[10px] md:text-[11px] text-txt-muted data-value whitespace-nowrap">
            {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Status Strip */}
      <div className="animate-fade-up stagger-1">
        <StatusStrip data={data} loading={isLoading} />
      </div>

      {/* System Vitals — 4 Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-up stagger-2">
        <GaugeCard label="CPU" value={data?.cpu.usage ?? 0}
          sublabel={data ? `${data.cpu.cores} cores` : "—"} color="var(--accent)" />
        <GaugeCard label="Memory" value={data?.memory.usage ?? 0}
          sublabel={data ? `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}` : "—"} color="var(--accent-dim)" />
        <GaugeCard label="Disk" value={data?.disk.usage ?? 0}
          sublabel={data ? `${data.disk.used} / ${data.disk.total}` : "—"}
          color={(data?.disk.usage ?? 0) > 85 ? "var(--warning)" : "var(--accent)"} />
        <GaugeCard label="Battery" value={data?.battery.level ?? 0}
          sublabel={data?.battery.powerSource || "—"}
          color={data ? batteryColor(data.battery.level) : "var(--accent)"} />
      </div>

      {/* Detail Row 1: Battery / Temperature / Network */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="animate-fade-up stagger-3">
          <BatteryCard data={data} />
        </div>
        <div className="animate-fade-up stagger-4">
          <TemperatureCard data={data} />
        </div>
        <div className="animate-fade-up stagger-5">
          <NetworkCard data={data} />
        </div>
      </div>

      {/* Detail Row 2: Services / Security / Updates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="animate-fade-up stagger-6">
          <ServicesCard data={data} />
        </div>
        <div className="animate-fade-up stagger-7">
          <SecurityCard data={data} />
        </div>
        <div className="animate-fade-up stagger-8">
          <UpdatesCard data={data} />
        </div>
      </div>

      {/* System Logs */}
      <div className="animate-fade-up stagger-8">
        <LogsViewer data={data} />
      </div>

      {/* Power Actions */}
      <div className="animate-fade-up stagger-9">
        <PowerActions />
      </div>
    </div>
  );
}

/* ---- Status Strip ---- */
function StatusStrip({ data, loading }: { data: ReturnType<typeof useSystemData>["data"]; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="card-static px-4 py-3 flex items-center gap-4">
        <div className="h-4 w-32 bg-surface-elevated rounded animate-pulse" />
        <div className="h-4 w-24 bg-surface-elevated rounded animate-pulse" />
        <div className="h-4 w-40 bg-surface-elevated rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card-static px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1">
      <div className="flex items-center gap-2">
        <div className="status-dot status-dot-online status-dot-pulse" />
        <span className="font-display font-semibold text-sm">{data.hostname}</span>
      </div>
      <Sep />
      <span className="text-xs text-txt-secondary">{data.os.name} {data.os.version}</span>
      <Sep />
      <span className="text-xs text-txt-secondary">
        Up <span className="data-value text-txt-primary font-semibold">{formatUptime(data.uptime)}</span>
      </span>
      <Sep />
      <span className="text-xs text-txt-muted">{data.os.arch}</span>
      <Sep />
      <span className="text-xs text-txt-secondary">
        Load{" "}
        <span className="data-value text-txt-primary font-semibold">
          {data.loadAverage?.map(v => v.toFixed(2)).join("  ") || "—"}
        </span>
      </span>
    </div>
  );
}

/* ---- Gauge Card Wrapper ---- */
function GaugeCard({ label, value, sublabel, color }: {
  label: string; value: number; sublabel: string; color: string;
}) {
  return (
    <div className="card flex flex-col items-center py-3 md:py-4 px-2 md:px-3">
      <Gauge value={value} label={label} sublabel={sublabel} color={color} size={100} />
    </div>
  );
}

/* ---- Battery Card ---- */
function BatteryCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const b = data?.battery;
  return (
    <Link href="/hardware" className="card px-4 py-3.5 group block">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Battery & Power</span>
        <ArrowIcon />
      </div>
      <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
        <KV label="Level" value={b ? `${b.level}%` : "—"} />
        <KV label="Health" value={b ? `${b.health}%` : "—"} />
        <KV label="Source" value={b?.powerSource || "—"} />
        <KV label="Cycles" value={b ? `${b.cycleCount}` : "—"} />
      </div>
    </Link>
  );
}

/* ---- Temperature Card ---- */
function TemperatureCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const t = data?.temperature;
  const celsius = t?.cpu;
  return (
    <Link href="/hardware" className="card px-4 py-3.5 group block">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Temperature</span>
        <ArrowIcon />
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="data-value text-3xl font-bold" style={{ color: tempColor(celsius ?? null) }}>
          {celsius !== null && celsius !== undefined ? `${celsius}` : "—"}
        </span>
        {celsius !== null && celsius !== undefined && (
          <span className="text-sm text-txt-muted">°C</span>
        )}
      </div>
      <StatusBadge
        variant={
          !t || t.label === "Unavailable" ? "neutral"
          : t.label === "Cool" || t.label === "Normal" ? "success"
          : t.label === "Warm" ? "warning"
          : "danger"
        }
        label={t?.label || "N/A"}
      />
    </Link>
  );
}

/* ---- Network Card ---- */
function NetworkCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const n = data?.network;
  return (
    <Link href="/network" className="card px-4 py-3.5 group block">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Network</span>
        <ArrowIcon />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-txt-muted">LAN</span>
          <span className="data-value text-xs text-txt-primary">{n?.lanIp || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-txt-muted">External</span>
          <span className="data-value text-xs text-txt-primary">{n?.externalIp || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-txt-muted">TailScale</span>
          <span className="data-value text-xs text-accent">{n?.tailscaleIp || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-txt-muted">Listening</span>
          <span className="data-value text-xs text-txt-primary">{n?.listeningPorts.length ?? "—"} ports</span>
        </div>
      </div>
    </Link>
  );
}

/* ---- Services Card ---- */
function ServicesCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const s = data?.services;
  const runningContainers = s?.docker.filter((c) => c.state === "running").length ?? 0;
  const totalContainers = s?.docker.length ?? 0;
  return (
    <Link href="/services" className="card px-4 py-3.5 group block">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Services</span>
        <ArrowIcon />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="data-value text-lg font-bold text-txt-primary">{runningContainers}</div>
          <div className="text-[10px] text-txt-muted">Containers{totalContainers > 0 ? ` / ${totalContainers}` : ""}</div>
        </div>
        <div>
          <div className="data-value text-lg font-bold text-txt-primary">{s?.cronJobs.length ?? 0}</div>
          <div className="text-[10px] text-txt-muted">Cron jobs</div>
        </div>
        <div>
          <div className="data-value text-lg font-bold text-txt-primary">
            {s?.systemServices.filter((sv) => sv.status === "running").length ?? 0}
          </div>
          <div className="text-[10px] text-txt-muted">Services up</div>
        </div>
      </div>
    </Link>
  );
}

/* ---- Security Card ---- */
function SecurityCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const sec = data?.security;
  return (
    <Link href="/security" className="card px-4 py-3.5 group block">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Security</span>
        <ArrowIcon />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="data-value text-3xl font-bold" style={{ color: sec ? gradeColor(sec.grade) : undefined }}>
            {sec?.grade || "—"}
          </span>
          <span className="text-[10px] text-txt-muted">{sec ? `${sec.score}/100` : ""}</span>
        </div>
        <div className="flex-1 space-y-1.5">
          <MiniCheck label="Firewall" ok={sec?.firewallEnabled ?? false} />
          <MiniCheck label="SSH hardened" ok={(sec?.sshKeyOnly ?? false) && (sec?.rootLoginDisabled ?? false)} />
          <MiniCheck label="Auto updates" ok={sec?.autoUpdates ?? false} />
        </div>
      </div>
      {sec && sec.warnings.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-line-dim">
          <span className="text-[10px] text-warning">{sec.warnings.length} warning{sec.warnings.length > 1 ? "s" : ""}</span>
        </div>
      )}
    </Link>
  );
}

/* ---- Logs Viewer ---- */
function LogsViewer({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const logs = data?.logs;
  return (
    <div className="card-static overflow-hidden">
      <Link href="/activity" className="px-4 py-3 flex items-center justify-between bg-surface-elevated hover:bg-surface-hover transition-colors cursor-pointer">
        <span className="section-label">Recent Logs</span>
        <span className="text-[10px] text-accent font-medium">View all →</span>
      </Link>
      <div className="max-h-[240px] overflow-y-auto">
        {logs && logs.length > 0 ? (
          <div className="divide-y divide-line-dim">
            {logs.map((log, i) => (
              <div key={i} className="px-4 py-1.5 hover:bg-surface-hover transition-colors">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="data-value text-[10px] text-txt-muted whitespace-nowrap shrink-0">
                    {log.timestamp?.slice(-8) || ""}
                  </span>
                  {log.unit && (
                    <span className="text-[10px] font-semibold text-accent shrink-0">{log.unit}</span>
                  )}
                  <span className="text-[11px] text-txt-secondary truncate">{log.message}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-txt-muted">
            {data ? "No logs available" : "Loading..."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Power Actions ---- */
function PowerActions() {
  const [confirming, setConfirming] = useState<"reboot" | "shutdown" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleAction = async (action: "reboot" | "shutdown") => {
    if (confirming !== action) {
      setConfirming(action);
      setTimeout(() => setConfirming(null), 5000); // auto-cancel after 5s
      return;
    }
    setConfirming(null);
    setStatus(`${action === "reboot" ? "Rebooting" : "Shutting down"}...`);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) setStatus(data.error || "Failed");
      else setStatus(data.message);
    } catch {
      setStatus("Connection lost — server may be restarting");
    }
  };

  return (
    <div className="card-static px-4 py-3.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="section-label">Power</span>
          {status && <p className="text-[11px] text-txt-muted mt-1">{status}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction("reboot")}
            className={clsx(
              "px-3 py-1.5 rounded text-[11px] font-semibold transition-all duration-150",
              confirming === "reboot"
                ? "bg-warning text-surface-card"
                : "bg-surface-elevated text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
            )}
          >
            {confirming === "reboot" ? "Confirm Reboot?" : "Reboot"}
          </button>
          <button
            onClick={() => handleAction("shutdown")}
            className={clsx(
              "px-3 py-1.5 rounded text-[11px] font-semibold transition-all duration-150",
              confirming === "shutdown"
                ? "bg-danger text-surface-card"
                : "bg-surface-elevated text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
            )}
          >
            {confirming === "shutdown" ? "Confirm Shutdown?" : "Shutdown"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Updates Card ---- */
function UpdatesCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const u = data?.updates;
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">System Updates</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className={clsx(
            "data-value text-3xl font-bold",
            (u?.available ?? 0) > 0 ? "text-warning" : "text-success"
          )}>
            {u?.available ?? 0}
          </span>
          <span className="text-[10px] text-txt-muted">available</span>
        </div>
        <div className="flex-1">
          <StatusBadge
            variant={(u?.available ?? 0) > 0 ? "warning" : "success"}
            label={(u?.available ?? 0) > 0 ? "Updates pending" : "Up to date"}
          />
          {u?.packages && u.packages.length > 0 && (
            <div className="mt-2 space-y-1">
              {u.packages.slice(0, 3).map((pkg, i) => (
                <div key={i} className="text-[10px] text-txt-muted truncate data-value">
                  {pkg.name} {pkg.current !== "—" ? `${pkg.current} →` : "→"} {pkg.latest}
                </div>
              ))}
              {u.packages.length > 3 && (
                <div className="text-[10px] text-txt-muted">+{u.packages.length - 3} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Helpers ---- */
function Sep() {
  return <span className="w-px h-3 bg-line-dim" />;
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-txt-muted">{label}</div>
      <div className="data-value text-sm font-semibold text-txt-primary">{value}</div>
    </div>
  );
}

function MiniCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={clsx("text-xs", ok ? "text-success" : "text-danger")}>{ok ? "✓" : "✗"}</span>
      <span className="text-txt-secondary">{label}</span>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className="text-txt-muted group-hover:text-accent transition-colors">
      <line x1="4" y1="8" x2="12" y2="8" />
      <polyline points="9 5 12 8 9 11" />
    </svg>
  );
}
