"use client";

import useSWR from "swr";
import { useId } from "react";
import clsx from "clsx";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { HistorySample } from "@/app/api/history/route";

export type Timeframe = "1h" | "6h" | "12h" | "24h" | "7d";
export const TIMEFRAMES: Timeframe[] = ["1h", "6h", "12h", "24h", "7d"];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useHistory(range: Timeframe) {
  const { data } = useSWR<{ range: string; samples: HistorySample[] }>(
    `/api/history?range=${range}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  );
  return data?.samples ?? [];
}

/* ---- Timeframe pill selector ---- */
export function TimeframePills({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (t: Timeframe) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded bg-surface-elevated p-0.5">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={clsx(
            "px-2 py-0.5 rounded-sm text-[10px] font-semibold data-value transition-colors duration-150",
            t === value
              ? "bg-accent-surface text-accent"
              : "text-txt-muted hover:text-txt-secondary"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ---- Axis / tooltip formatting ---- */
function timeFormatter(range: Timeframe) {
  return (ts: number) => {
    const d = new Date(ts * 1000);
    if (range === "7d")
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (range === "24h" || range === "12h")
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  };
}

function fullTime(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface SeriesDef {
  key: string;
  name: string;
  color: string; // CSS variable, e.g. "var(--accent)"
  fill?: boolean;
}

/* ---- Generic history area/line chart ---- */
export function HistoryChart({
  data,
  series,
  range,
  height = 150,
  unit = "",
  domain,
  formatValue,
  formatAxis,
  step,
  reference,
}: {
  data: Record<string, number | null>[];
  series: SeriesDef[];
  range: Timeframe;
  height?: number;
  unit?: string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  formatValue?: (v: number) => string;
  formatAxis?: (v: number) => string;
  /** Fit the Y axis to the data in view: floor at the lowest reading and cap at
   *  the highest, each rounded out to a multiple of `step`, with a gridline and
   *  label at every step. Overrides `domain`. Used where the interesting signal
   *  is the swing, not the distance from zero (temperature). */
  step?: number;
  /** A dashed horizontal marker, e.g. a 30-day average to compare against. */
  reference?: { y: number; label: string };
}) {
  const gradientBase = useId().replace(/:/g, "");
  const fmt = formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
  const fmtAxis = formatAxis ?? fmt;

  let yDomain = domain ?? [0, "auto"];
  let yTicks: number[] | undefined;
  if (step) {
    const vals = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (reference) vals.push(reference.y);
    if (vals.length) {
      const lo = Math.floor(Math.min(...vals) / step) * step;
      let hi = Math.ceil(Math.max(...vals) / step) * step;
      if (hi === lo) hi = lo + step;
      yDomain = [lo, hi];
      yTicks = [];
      for (let v = lo; v <= hi; v += step) yTicks.push(v);
    }
  }

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-txt-muted"
        style={{ height }}
      >
        Collecting samples. Check back in a few minutes.
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gradientBase}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.fill === false ? 0 : 0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={timeFormatter(range)}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => fmtAxis(v)}
            tickLine={false}
            axisLine={false}
            width={58}
            domain={yDomain}
            ticks={yTicks}
            interval={yTicks ? 0 : "preserveEnd"}
            allowDataOverflow={!!yTicks}
          />
          {reference && (
            <ReferenceLine
              y={reference.y}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: reference.label, position: "insideTopLeft", fill: "var(--text-muted)", fontSize: 10 }}
            />
          )}
          <Tooltip
            labelFormatter={(ts) => fullTime(ts as number)}
            formatter={(value, name) => [fmt(value as number), name as string]}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{ color: "var(--text-muted)", marginBottom: 4 }}
            isAnimationActive={false}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={1.5}
              fill={`url(#${gradientBase}-${i})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- Legend chip ---- */
export function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-txt-muted">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
