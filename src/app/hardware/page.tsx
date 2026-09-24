"use client";

import { useEffect, useState } from "react";
import { TaskManager } from "@/components/task-manager";
import { PowerPanel } from "@/components/power-panel";
import { ThrottleFlag } from "@/components/throttle-flag";
import useSWR from "swr";
import type { PowerResponse } from "@/lib/types";
import { useSystemData } from "@/hooks/use-system-data";
import { Gauge } from "@/components/gauge";
import { StatusBadge } from "@/components/status-badge";
import { AnimatedNumber } from "@/components/animated-number";
import {
  HistoryChart,
  TimeframePills,
  LegendChip,
  useHistory,
  type Timeframe,
} from "@/components/history-chart";
import { formatBytes, batteryColor, healthColor, tempColor } from "@/lib/utils";
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
  useHashFocus();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight title-caret">Hardware</h1>

      {b?.present ? <BatterySection data={data} /> : <PowerCoolingSection data={data} />}

      <TemperatureSection data={data} />

      {/* CPU & Memory Section */}
      <section className="space-y-3">
        <h2 className="section-label">System</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CpuCard data={data} />
          <MemoryCard data={data} />
        </div>
      </section>

      <DiskSection data={data} />

      {/* Multiple Disks */}
      {data?.disks && data.disks.length > 1 && (
        <section className="space-y-3">
          <h2 className="section-label">All Mount Points</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Task Manager — the same live, sortable table as the Overview */}
      <TaskManager id="processes" />
    </div>
  );
}

/* ==== Power & Cooling (AC machine — no battery installed) ==== */
function PowerCoolingSection({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const t = data?.temperature;
  const fanPct =
    t?.fanRpm != null && t.fanMin != null && t.fanMax != null && t.fanMax > t.fanMin
      ? Math.round(((t.fanRpm - t.fanMin) / (t.fanMax - t.fanMin)) * 100)
      : null;
  const headroom = t?.cpu != null && t?.throttleAt ? Math.max(0, Math.round(t.throttleAt - t.cpu)) : null;
  // Signed distance from the warning line: positive = above it.
  const overWarn = t?.cpu != null && t?.warnAt ? Math.round(t.cpu - t.warnAt) : null;
  const { data: power } = useSWR<PowerResponse>("/api/power", (u: string) => fetch(u).then((r) => r.json()), { refreshInterval: 5_000 });

  return (
    <section id="power" className="space-y-3 scroll-mt-16 md:scroll-mt-4">
      <h2 className="section-label">Power & Cooling</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Power source */}
        <div className="card px-4 py-3.5">
          <div className="text-[10px] text-txt-muted mb-2">Power Source</div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="status-dot status-dot-online" />
            <span className="text-lg font-bold text-txt-primary">AC Power</span>
          </div>
          <div className="text-[11px] text-txt-muted">
            Mains-powered, no battery installed
          </div>
          <a href="#energy" className="mt-2.5 pt-2.5 border-t border-line-dim block group">
            <div className="flex items-baseline gap-1.5">
              <span className="data-value text-2xl font-bold text-accent">
                {power?.live?.wallW != null ? <AnimatedNumber value={Math.round(power.live.wallW)} /> : "—"}
              </span>
              <span className="text-[11px] text-txt-muted">W from the wall (est.)</span>
            </div>
            <div className="text-[10px] text-txt-muted mt-0.5">
              {power?.live?.dcW != null ? `${power.live.dcW.toFixed(1)} W DC measured` : "DC-in unavailable"}
              {t?.cpuPowerW != null && ` · CPU ${t.cpuPowerW} W`}
              {power?.last24h?.costPerDay != null && power.tariff && ` · ${power.tariff.currency} ${power.last24h.costPerDay.toFixed(2)}/day`}
              <span className="text-accent group-hover:underline"> · details ↓</span>
            </div>
          </a>
        </div>

        {/* Fan */}
        <div className="card px-4 py-3.5">
          <div className="text-[10px] text-txt-muted mb-2">Exhaust Fan</div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="data-value text-2xl font-bold text-txt-primary">
              {t?.fanRpm != null ? <AnimatedNumber value={t.fanRpm} /> : "—"}
            </span>
            {t?.fanRpm != null && <span className="text-[11px] text-txt-muted">RPM</span>}
          </div>
          {fanPct !== null && t?.fanMin != null && t?.fanMax != null && (
            <>
              <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(fanPct, 2)}%`,
                    background: fanPct > 75 ? "var(--warning)" : "var(--accent)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-txt-muted">
                <span>{t.fanMin} min</span>
                <span>{fanPct}% of range</span>
                <span>{t.fanMax} max</span>
              </div>
            </>
          )}
        </div>

        {/* Thermal headroom: distance from the 86 degree warning line (signed),
            distance from the real hardware throttle point, and the CPU's own
            live answer to "is it throttling". */}
        <div className="card px-4 py-3.5">
          <div className="text-[10px] text-txt-muted mb-2">Thermal Headroom</div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span
              className="data-value text-2xl font-bold"
              style={{ color: overWarn == null ? undefined : overWarn > 0 ? "var(--danger)" : overWarn > -10 ? "var(--warning)" : "var(--success)" }}
            >
              {overWarn !== null ? `${Math.abs(overWarn)}°` : headroom !== null ? `${headroom}°` : "—"}
            </span>
            <span className="text-[11px] text-txt-muted">
              {overWarn !== null
                ? `${overWarn > 0 ? "above" : "below"} the ${t?.warnAt}°C warning limit`
                : headroom !== null ? "below limit" : ""}
            </span>
          </div>
          <div className="text-[11px] text-txt-muted">
            {t?.throttleAt
              ? headroom !== null && headroom > 0
                ? `${headroom}° below hardware throttling at ${t.throttleAt}°C`
                : `At the ${t.throttleAt}°C hardware throttle point`
              : "Throttle limit unavailable"}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ThrottleFlag t={t?.throttling} size="lg" />
            <StatusBadge
              variant={
                !t || t.label === "Unavailable" ? "neutral"
                : t.label === "Cool" || t.label === "Normal" ? "success"
                : t.label === "Warm" ? "warning" : "danger"
              }
              label={t?.label || "N/A"}
            />
          </div>
          {t?.throttling?.events != null && (
            <div className="mt-1.5 text-[10px] text-txt-muted">
              {t.throttling.events} brief throttle event{t.throttling.events === 1 ? "" : "s"} since boot · {((t.throttling.totalMs ?? 0) / 1000).toFixed(2)} s in total
            </div>
          )}
        </div>
      </div>
      <div id="energy" className="scroll-mt-16 md:scroll-mt-4">
        <PowerPanel />
      </div>
    </section>
  );
}

/* ==== Battery (portable hardware only) ==== */
function BatterySection({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const b = data?.battery;
  return (
    <section id="battery" className="space-y-3 scroll-mt-16 md:scroll-mt-4">
      <h2 className="section-label">Battery & Power</h2>
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <div className="card flex flex-col items-center justify-center py-6">
          <Gauge
            value={b?.level ?? 0}
            label="Charge"
            sublabel={b?.charging ? "Charging" : b?.powerSource}
            color={b ? batteryColor(b.level) : "var(--accent)"}
            size={160}
            strokeWidth={10}
          />
          {b?.timeRemaining && (
            <span className="text-xs text-txt-muted mt-2">{b.timeRemaining} remaining</span>
          )}
        </div>
        <div className="card px-5 py-4">
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
    </section>
  );
}

/* ==== Temperature + history ==== */
function TemperatureSection({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const t = data?.temperature;
  const [range, setRange] = useState<Timeframe>("6h");
  const samples = useHistory(range);
  const chartData = samples.map((s) => ({ ts: s.ts, temp: s.temp }));

  return (
    <section id="temperature" className="space-y-3 scroll-mt-16 md:scroll-mt-4">
      <h2 className="section-label">Temperature</h2>
      <div className="card px-5 py-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <span
              className="data-value text-4xl font-bold"
              style={{ color: tempColor(t?.cpu ?? null) }}
            >
              {t?.cpu !== null && t?.cpu !== undefined ? <AnimatedNumber value={t.cpu} /> : "—"}
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
                ? "No temperature sensor detected"
                : "CPU package sensor"}
            </p>
          </div>
          {/* Per-core readings */}
          {t?.cores && t.cores.length > 0 && (
            <div className="flex items-center gap-4 ml-auto">
              {t.cores.map((c) => (
                <div key={c.name} className="text-center">
                  <div className="data-value text-sm font-semibold" style={{ color: tempColor(c.temp) }}>
                    {c.temp}°
                  </div>
                  <div className="text-[10px] text-txt-muted">{c.name}</div>
                </div>
              ))}
            </div>
          )}
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

        {/* History graph */}
        <div className="mt-5 pt-4 border-t border-line-dim">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-txt-secondary">History</span>
              <LegendChip color="var(--accent)" label="CPU package" />
            </div>
            <TimeframePills value={range} onChange={setRange} />
          </div>
          <HistoryChart
            data={chartData}
            series={[{ key: "temp", name: "CPU package", color: "var(--accent)" }]}
            range={range}
            height={300}
            unit="°"
            step={5}
          />
        </div>
      </div>
    </section>
  );
}

/* ==== CPU card with per-thread meters + history ==== */
function CpuCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const [range, setRange] = useState<Timeframe>("6h");
  const samples = useHistory(range);
  const chartData = samples.map((s) => ({ ts: s.ts, cpu: s.cpu }));
  const perCore = data?.cpu.perCore ?? [];

  return (
    <div id="cpu" className="card px-5 py-4 scroll-mt-16 md:scroll-mt-4">
      <h3 className="text-xs font-semibold text-txt-secondary mb-3">Processor</h3>
      <div className="space-y-3">
        <Detail label="Model" value={data?.cpu.model || "—"} />
        <div className="grid grid-cols-2 gap-x-8">
          <Detail label="Topology" value={
            data
              ? data.cpu.physicalCores
                ? `${data.cpu.physicalCores} cores / ${data.cpu.cores} threads`
                : `${data.cpu.cores} threads`
              : "—"
          } />
          <Detail label="Usage" value={data ? `${data.cpu.usage}%` : "—"} />
        </div>

        {/* Per-thread meters */}
        {perCore.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {perCore.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="data-value text-[10px] text-txt-muted w-7 shrink-0">T{i}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(u, 1)}%`,
                      background: u > 85 ? "var(--warning)" : "var(--accent)",
                    }}
                  />
                </div>
                <span className="data-value text-[10px] text-txt-secondary w-8 text-right shrink-0">{u}%</span>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        <div className="pt-3 border-t border-line-dim">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-txt-secondary">Usage history</span>
            <TimeframePills value={range} onChange={setRange} />
          </div>
          <HistoryChart
            data={chartData}
            series={[{ key: "cpu", name: "CPU", color: "var(--accent)" }]}
            range={range}
            height={120}
            unit="%"
            domain={[0, 100]}
          />
        </div>
      </div>
    </div>
  );
}

/* ==== Memory card with history ==== */
function MemoryCard({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const [range, setRange] = useState<Timeframe>("6h");
  const samples = useHistory(range);
  const chartData = samples.map((s) => ({ ts: s.ts, mem: s.mem_pct, swap: s.swap_pct }));

  return (
    <div id="memory" className="scroll-mt-16 md:scroll-mt-4 card px-5 py-4">
      <h3 className="text-xs font-semibold text-txt-secondary mb-3">Memory</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-x-4">
          <Detail label="Total" value={data ? formatBytes(data.memory.total) : "—"} />
          <Detail label="Used" value={data ? formatBytes(data.memory.used) : "—"} />
          <Detail label="Free" value={data ? formatBytes(data.memory.free) : "—"} />
        </div>
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
        {data?.swap && data.swap.total > 0 && (
          <Detail label={`Swap (${formatBytes(data.swap.total)})`}>
            <div className="flex items-center gap-2">
              <span className="data-value text-sm font-semibold text-txt-primary">{data.swap.usage}%</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${data.swap.usage}%`,
                    background: data.swap.usage > 50 ? "var(--warning)" : "var(--accent-dim)",
                  }}
                />
              </div>
            </div>
          </Detail>
        )}

        {/* History */}
        <div className="pt-3 border-t border-line-dim">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold text-txt-secondary">Usage history</span>
              <LegendChip color="var(--accent-dim)" label="RAM" />
              <LegendChip color="var(--warning)" label="Swap" />
            </div>
            <TimeframePills value={range} onChange={setRange} />
          </div>
          <HistoryChart
            data={chartData}
            series={[
              { key: "mem", name: "RAM", color: "var(--accent-dim)" },
              { key: "swap", name: "Swap", color: "var(--warning)", fill: false },
            ]}
            range={range}
            height={120}
            unit="%"
            domain={[0, 100]}
          />
        </div>
      </div>
    </div>
  );
}

/* ==== Disk section with I/O + SMART ==== */
function DiskSection({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const smart = data?.smart;
  const io = data?.diskIo;

  return (
    <section id="disk" className="space-y-3 scroll-mt-16 md:scroll-mt-4">
      <h2 className="section-label">Disk</h2>
      <div className="card px-5 py-4">
        <div className="flex flex-col md:flex-row items-start gap-6">
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
            <Detail label="Read">
              <span className="data-value text-sm font-semibold text-success">
                {io ? `${formatBytes(io.readRate)}/s` : "—"}
              </span>
            </Detail>
            <Detail label="Write">
              <span className="data-value text-sm font-semibold text-accent">
                {io ? `${formatBytes(io.writeRate)}/s` : "—"}
              </span>
            </Detail>
          </div>
        </div>

        {/* SMART row */}
        {smart?.available && (
          <div className="mt-4 pt-3.5 border-t border-line-dim flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-txt-muted">S.M.A.R.T.</span>
              <StatusBadge
                variant={smart.healthy === true ? "success" : smart.healthy === false ? "danger" : "neutral"}
                label={smart.healthy === true ? "Passed" : smart.healthy === false ? "Failing" : "Unknown"}
              />
            </div>
            {smart.model && (
              <div className="text-[11px] text-txt-secondary data-value">{smart.model}</div>
            )}
            {smart.temperature !== null && (
              <div className="text-[11px] text-txt-muted">
                Drive temp <span className="data-value font-semibold text-txt-secondary">{smart.temperature}°C</span>
              </div>
            )}
            {smart.powerOnHours !== null && (
              <div className="text-[11px] text-txt-muted">
                Powered on <span className="data-value font-semibold text-txt-secondary">{Math.round(smart.powerOnHours / 24 / 365 * 10) / 10} yrs</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
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

/* ==== Deep links from the Overview gauges (/hardware#cpu, #memory, #disk,
 * #temperature, #battery, #processes). The browser's own hash jump fires
 * before the live data has sized the sections above the target, so it can
 * land short; this re-scrolls once the page has settled and flashes the
 * target so the eye finds it. ==== */
function useHashFocus() {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("anchor-flash");
      void el.offsetWidth; // restart the animation on a repeat visit
      el.classList.add("anchor-flash");
    };
    go();
    const t = window.setTimeout(go, 450);
    window.addEventListener("hashchange", go);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", go); };
  }, []);
}
