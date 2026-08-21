"use client";

import useSWR from "swr";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes, fmtFromIso, TZ_LABEL } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type Wsb = {
  present: boolean;
  status?: string;
  last_run?: string;
  ago?: string;
  dur_s?: number;
  downtime_s?: number;
  xfer_bytes?: number;
  run_id?: string;
  /** Name of the standby machine, as written by whatever performs the sync. */
  host?: string;
  fallback?: number;
  stale?: boolean;
  overdue?: boolean;
  msg?: string;
};

type Variant = "success" | "warning" | "danger" | "neutral";

export function WarmStandbyCard() {
  const { data, isLoading } = useSWR<Wsb>("/api/warm-standby", fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const badge = deriveBadge(data);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-label">Warm-Standby Backup</h2>
        {/* Rendered from the status file rather than written into the source.
            Two real machine names used to be hardcoded here, which put them in
            the UI and in this public repository. */}
        <span className="text-[11px] text-txt-muted data-value">
          this box {data?.host ? <>&rarr; {data.host}</> : null}
        </span>
      </div>
      <div className="card-static px-5 py-4">
        {data?.present ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <StatusBadge variant={badge.variant} label={badge.label} pulse={badge.variant === "success"} />
                <span className="text-sm text-txt-secondary">
                  last sync <span className="text-txt-primary font-semibold">{data.ago}</span>
                </span>
              </div>
              <span className="data-value text-[11px] text-txt-muted" title={data.last_run}>{fmtFromIso(data.last_run)}{TZ_LABEL ? ` ${TZ_LABEL}` : ""}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Duration" value={data.dur_s != null ? `${data.dur_s}s` : "—"} />
              <Metric label="Downtime" value={data.downtime_s != null ? `${data.downtime_s}s` : "—"} warn={(data.downtime_s ?? 0) > 60} />
              <Metric label="Transferred" value={data.xfer_bytes != null ? formatBytes(data.xfer_bytes) : "—"} />
              <Metric label="Run ID" value={data.run_id ?? "—"} mono />
            </div>
            {data.stale && (
              <p className="text-[11px] text-warning">
                No successful sync in over a day &mdash; the Air may be asleep or offline.
              </p>
            )}
            {data.fallback === 1 && (
              <p className="text-[11px] text-warning">
                Last run used the Tailscale fallback (LAN path down &mdash; check the DHCP reservation).
              </p>
            )}
            {data.status && data.status !== "OK" && data.msg && (
              <p className="text-[11px] text-txt-muted data-value">{data.msg}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-txt-secondary">{isLoading ? "Loading…" : "No backup has run yet."}</p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-txt-muted">{label}</div>
      <div className={`mt-0.5 font-semibold truncate ${warn ? "text-warning" : "text-txt-primary"} ${mono ? "data-value text-[11px]" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}

function deriveBadge(d?: Wsb): { variant: Variant; label: string } {
  if (!d?.present) return { variant: "neutral", label: "never run" };
  if (d.overdue) return { variant: "danger", label: "overdue" };
  if (d.status === "FAILED") return { variant: "danger", label: "failed" };
  if (d.status === "DEGRADED") return { variant: "warning", label: "degraded" };
  if (d.stale) return { variant: "warning", label: "stale" };
  if (d.status === "OK") return { variant: "success", label: "healthy" };
  return { variant: "neutral", label: d.status ?? "unknown" };
}
