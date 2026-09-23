"use client";

import useSWR from "swr";
import clsx from "clsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { AnimatedNumber } from "@/components/animated-number";
import { HistoryChart } from "@/components/history-chart";
import type { PowerResponse } from "@/lib/types";

/* Power & Energy — what the box draws from the wall, and what it costs.
 *
 * Reads /api/power, which reads the root power sampler's files. The one
 * number that is measured is DC-in (the Mac's SMC). Everything "from the
 * wall" is DC-in divided by the configured supply efficiency, and the panel
 * says so in plain words, because an estimate presented as a reading is the
 * failure a dashboard exists to avoid.
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PowerPanel() {
  const { data } = useSWR<PowerResponse>("/api/power", fetcher, { refreshInterval: 5_000, revalidateOnFocus: true });

  if (!data) return <Shell><div className="h-40 animate-pulse bg-surface-elevated rounded" /></Shell>;
  if (!data.ok) {
    return (
      <Shell>
        <p className="text-[11px] text-txt-muted">
          Power readings unavailable: {data.error ?? "unknown error"}. Install the sampler with{" "}
          <code className="data-value">collectors/install-power-sampler.sh</code>.
        </p>
      </Shell>
    );
  }

  const { live, last24h: d24, avg30d: d30, tariff: t } = data;
  const eff = data.efficiency;
  const cur = t?.currency ?? "";
  const money = (v: number | null | undefined, dp = 2) => (v == null ? "—" : `${cur} ${v.toFixed(dp)}`);
  const cpu = live?.cpuW ?? null;
  const dc = live?.dcW ?? null;
  const wall = live?.wallW ?? null;
  const system = dc != null && cpu != null ? Math.max(0, dc - cpu) : null;
  const loss = wall != null && dc != null ? Math.max(0, wall - dc) : null;
  const compareReady = data.daysRecorded >= 2 && d24 && d30;
  const delta = compareReady ? ((d24!.avgW - d30!.avgW) / d30!.avgW) * 100 : null;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthKwh = d30 ? d30.kwhPerDay * daysInMonth : null;
  const since = data.since ? new Date(data.since * 1000) : null;

  return (
    <Shell live={live?.stale === false}>
      {/* Top row: live reading + three energy tiles */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1fr_1fr] gap-3">
        <div className="rounded-lg border border-line-dim bg-surface-elevated px-4 py-3.5">
          <div className="text-[10px] text-txt-muted mb-1">From the wall, now</div>
          <div className="flex items-baseline gap-1.5">
            <span className="data-value text-4xl font-bold text-accent">
              {wall != null ? <AnimatedNumber value={Math.round(wall)} /> : "—"}
            </span>
            <span className="text-sm text-txt-muted">W</span>
            <span className="text-[10px] text-txt-muted ml-1" title="Wall draw is estimated: measured DC-in divided by the supply efficiency set in sentinel.config.json">est.</span>
          </div>
          <div className="text-[11px] text-txt-muted mt-0.5">
            <span className="data-value text-txt-secondary">{dc != null ? dc.toFixed(1) : "—"} W</span> measured DC-in ÷ {Math.round(eff * 100)}% supply efficiency
          </div>
          {dc != null && wall != null && (
            <div className="mt-3">
              <div className="flex h-2 rounded-full overflow-hidden bg-surface-elevated">
                <Seg w={cpu ?? 0} of={wall} color="var(--accent)" title={`CPU package ${cpu?.toFixed(1)} W (Intel RAPL)`} />
                <Seg w={system ?? 0} of={wall} color="color-mix(in oklab, var(--accent) 45%, transparent)" title={`Rest of the machine ${system?.toFixed(1)} W: board, memory, SSD, fan`} />
                <Seg w={loss ?? 0} of={wall} color="color-mix(in oklab, var(--warning) 55%, transparent)" title={`Lost as heat in the power supply ≈ ${loss?.toFixed(1)} W (estimate)`} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-txt-muted">
                <Key color="var(--accent)" label={`CPU ${cpu?.toFixed(0) ?? "—"} W`} />
                <Key color="color-mix(in oklab, var(--accent) 45%, transparent)" label={`Rest of system ${system?.toFixed(0) ?? "—"} W`} />
                <Key color="color-mix(in oklab, var(--warning) 55%, transparent)" label={`Supply loss ~${loss?.toFixed(0) ?? "—"} W`} />
              </div>
            </div>
          )}
        </div>

        <Tile
          label="Last 24 hours"
          kwh={d24?.kwhPerDay}
          cost={money(d24?.costPerDay)}
          sub={d24 ? `avg ${d24.avgW.toFixed(0)} W · peak ${d24.peakW.toFixed(0)} W` : "No readings yet"}
          foot={
            delta != null ? (
              <span className={clsx("font-semibold", delta > 5 ? "text-warning" : delta < -5 ? "text-success" : "text-txt-secondary")}>
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(0)}% vs 30-day average
              </span>
            ) : (
              <span>Comparison needs 2 days of history ({data.daysRecorded} so far)</span>
            )
          }
          note={d24 && d24.coverageHours < 23.5 ? `from ${d24.coverageHours} h recorded, scaled to a day` : undefined}
        />
        <Tile
          label="30-day average, per day"
          kwh={d30?.kwhPerDay}
          cost={money(d30?.costPerDay)}
          sub={d30 ? `avg ${d30.avgW.toFixed(0)} W · peak ${d30.peakW.toFixed(0)} W` : "No readings yet"}
          foot={<span>{data.daysRecorded} of 30 days recorded</span>}
        />
        <Tile
          label={`This month, projected (${daysInMonth} days)`}
          kwh={monthKwh ?? undefined}
          kwhUnit="kWh"
          cost={money(d30?.costPerDay != null ? d30.costPerDay * daysInMonth : null)}
          sub={d30 ? `at the 30-day average of ${d30.avgW.toFixed(0)} W` : "No readings yet"}
          foot={t ? (
            <span title={t.source}>
              {(t.ratePerKwh * 100).toFixed(2)} fils per kWh
              {t.householdMonthlyKwh > 0 && monthKwh != null && ` · ${((monthKwh / t.householdMonthlyKwh) * 100).toFixed(1)}% of your ${t.householdMonthlyKwh.toLocaleString("en-US")} kWh bill`}
            </span>
          ) : <span>No tariff set</span>}
        />
      </div>

      {/* 24 h profile against the 30-day average */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-txt-secondary">Last 24 hours · wall watts, 5-minute average</span>
        </div>
        <HistoryChart
          data={data.series.map((p) => ({ ts: p.ts, wall: p.wall, peak: p.peak }))}
          series={[
            { key: "wall", name: "Average", color: "var(--accent)" },
            { key: "peak", name: "Peak", color: "var(--warning)", fill: false },
          ]}
          range="24h"
          height={220}
          unit=" W"
          step={5}
          reference={d30 && data.daysRecorded >= 2 ? { y: Math.round(d30.avgW), label: `30-day avg ${Math.round(d30.avgW)} W` } : undefined}
        />
      </div>

      {/* Daily energy bars */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-txt-secondary mb-2">Daily energy · last 30 days</div>
        {data.days.length > 0 ? (
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.days} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8) + "/" + d.slice(5, 7)} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}`} tickLine={false} axisLine={false} width={58} unit=" kWh" />
                <Tooltip
                  cursor={{ fill: "var(--bg-hover)" }}
                  contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "11px", color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-muted)" }}
                  formatter={(_v, _n, item) => {
                    const d = item.payload as PowerResponse["days"][number];
                    return [`${d.kwh.toFixed(2)} kWh · ${money(d.cost)} · avg ${d.avgW.toFixed(0)} W · ${Math.round(d.coverage * 100)}% of day recorded${d.partial ? " (today, so far)" : ""}`, "Energy"];
                  }}
                  isAnimationActive={false}
                />
                <Bar dataKey="kwh" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {data.days.map((d) => (
                    <Cell key={d.date} fill={d.partial ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[11px] text-txt-muted">No full minutes recorded yet.</p>
        )}
      </div>

      <p className="mt-3 pt-3 border-t border-line-dim text-[10px] leading-relaxed text-txt-muted">
        Measured: DC-in from the Mac&apos;s SMC and CPU power from Intel RAPL, every 2 seconds, by the root
        <span className="data-value"> node-power-sampler</span> service. Estimated: wall draw, which assumes {Math.round(eff * 100)}% supply
        efficiency; a metering smart plug would make it exact. Daily figures are average watts × 24 h, so partial days
        still compare fairly. {t && <>Cost uses {(t.ratePerKwh * 100).toFixed(2)} fils per kWh: {t.source}.{" "}
        {t.householdMonthlyKwh ? `Slab chosen for ${t.householdMonthlyKwh.toLocaleString("en-US")} kWh a month household use.` : "Green slab assumed; set power.tariff.householdMonthlyKwh in sentinel.config.json from your DEWA bill to use your real slab."}</>}
        {since && <> Recording since {since.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</>}
      </p>
    </Shell>
  );
}

function Shell({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="card-static px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Power & Energy</span>
        <span className="flex items-center gap-1.5 text-[10px] text-txt-muted">
          <span className={clsx("status-dot", live ? "status-dot-online status-dot-pulse" : "status-dot-offline")} />
          {live ? "live · every 2 s" : "waiting for sampler"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Tile({ label, kwh, kwhUnit = "kWh/day", cost, sub, foot, note }: {
  label: string; kwh?: number; kwhUnit?: string; cost: string; sub: string; foot: React.ReactNode; note?: string;
}) {
  return (
    <div className="rounded-lg border border-line-dim bg-surface-elevated px-4 py-3.5 flex flex-col">
      <div className="text-[10px] text-txt-muted mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="data-value text-2xl font-bold text-txt-primary">{cost}</span>
      </div>
      <div className="text-[11px] text-txt-secondary data-value">
        {kwh != null ? `${kwh.toFixed(2)} ${kwhUnit}` : "—"}
      </div>
      <div className="text-[10px] text-txt-muted mt-0.5">{sub}</div>
      {note && <div className="text-[10px] text-txt-muted italic">{note}</div>}
      <div className="mt-auto pt-2 text-[10px] text-txt-muted">{foot}</div>
    </div>
  );
}

function Seg({ w, of, color, title }: { w: number; of: number; color: string; title: string }) {
  return <div title={title} style={{ width: `${of > 0 ? (w / of) * 100 : 0}%`, background: color }} className="h-full transition-all duration-700" />;
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
