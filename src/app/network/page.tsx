"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useSystemData } from "@/hooks/use-system-data";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes } from "@/lib/utils";
import {
  HistoryChart,
  TimeframePills,
  LegendChip,
  useHistory,
  type Timeframe,
} from "@/components/history-chart";
import type { LanDevice } from "@/app/api/devices/route";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Compact byte-rate label for chart axes ("7.8K", "1.2M") — full form stays in tooltips
function compactBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.round(bytes)}B`;
  const units = ["K", "M", "G"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}${units[i]}`;
}

export default function NetworkPage() {
  const { data } = useSystemData();
  const n = data?.network;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight title-caret">Network</h1>

      {/* IP Addresses */}
      <section className="space-y-3">
        <h2 className="section-label">IP Addresses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <IpCard label="LAN IP" ip={n?.lanIp || "—"} description="Local network address" />
          <IpCard label="External IP" ip={n?.externalIp || "—"} description="Public-facing address" />
          <IpCard label="TailScale IP" ip={n?.tailscaleIp || "—"} description="VPN mesh address" accent />
        </div>
      </section>

      {/* Network Details */}
      <section className="space-y-3">
        <h2 className="section-label">Network Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="card px-4 py-3.5">
            <div className="text-[10px] text-txt-muted mb-1">Default Gateway</div>
            <div className="data-value text-sm font-bold text-txt-primary">{n?.gateway || "—"}</div>
          </div>
          <div className="card px-4 py-3.5">
            <div className="text-[10px] text-txt-muted mb-1">Network Manager</div>
            <div className="text-sm font-bold text-txt-primary">{n?.networkManager || "—"}</div>
          </div>
          <div className="card px-4 py-3.5 sm:col-span-2 lg:col-span-1">
            <div className="text-[10px] text-txt-muted mb-1">DNS Servers</div>
            <div className="space-y-0.5">
              {n?.dnsServers && n.dnsServers.length > 0 ? (
                n.dnsServers.slice(0, 4).map((dns, i) => (
                  <div key={i} className="data-value text-xs text-txt-primary">{dns}</div>
                ))
              ) : (
                <div className="text-xs text-txt-muted">—</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Throughput — live + history */}
      <ThroughputSection data={data} />

      {/* Devices on the Wi-Fi network */}
      <DevicesSection />

      {/* Interfaces */}
      <section className="space-y-3">
        <h2 className="section-label">Network Interfaces</h2>
        <div className="card-static overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead>
              <tr className="border-b border-line-dim">
                <Th>Interface</Th>
                <Th>IP Address</Th>
                <Th>MAC Address</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {n?.interfaces && n.interfaces.length > 0 ? (
                n.interfaces.map((iface, i) => (
                  <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                    <Td><span className="data-value font-semibold">{iface.name}</span></Td>
                    <Td><span className="data-value">{iface.ip}</span></Td>
                    <Td><span className="data-value text-txt-muted">{iface.mac || "—"}</span></Td>
                    <Td>
                      <StatusBadge variant={iface.status === "up" ? "success" : "danger"} label={iface.status} />
                    </Td>
                  </tr>
                ))
              ) : (
                <tr><Td colSpan={4}><span className="text-txt-muted">No interfaces detected</span></Td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Listening Ports */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Listening Ports</h2>
          {n && (
            <span className="text-[11px] text-txt-muted">
              <span className="data-value font-semibold text-txt-primary">{n.listeningPorts.length}</span> ports open
              {n.listeningPorts.filter((p) => !p.pid || p.process === "unknown").length > 0 && (
                <>
                  {" · "}
                  <span className="data-value font-semibold text-warning">
                    {n.listeningPorts.filter((p) => !p.pid || p.process === "unknown").length}
                  </span>{" "}
                  owned by another user
                </>
              )}
            </span>
          )}
        </div>
        {/* Stated rather than silently blank: `ss` only reveals process ownership
            for sockets belonging to the user running it, so a socket held by root
            or by a container shows no name. The port itself is still real — it is
            the Process and PID columns that cannot be filled, and a dash there
            would read as "nothing is listening". Sentinel is deliberately not
            given extra privilege to close this gap. */}
        <p className="text-[10px] text-txt-muted -mt-1">
          Process and PID are blank for sockets owned by another user (root, or a container).
          The port and address are still accurate.
        </p>
        <div className="card-static overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left min-w-[540px]">
              <thead className="sticky top-0 bg-surface-card z-10">
                <tr className="border-b border-line-dim">
                  <Th>Port</Th>
                  <Th>Process</Th>
                  <Th>PID</Th>
                  <Th>Protocol</Th>
                  <Th>Address</Th>
                </tr>
              </thead>
              <tbody>
                {n?.listeningPorts && n.listeningPorts.length > 0 ? (
                  [...n.listeningPorts]
                    .sort((a, b) => a.port - b.port)
                    .map((p, i) => (
                      <tr key={i} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                        <Td>
                          <span className="data-value font-semibold text-accent">{p.port}</span>
                        </Td>
                        <Td>{p.process}</Td>
                        <Td><span className="data-value text-txt-muted">{p.pid}</span></Td>
                        <Td>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-elevated text-txt-secondary">
                            {p.protocol}
                          </span>
                        </Td>
                        <Td><span className="data-value text-txt-muted text-[11px]">{p.address}</span></Td>
                      </tr>
                    ))
                ) : (
                  <tr><Td colSpan={5}><span className="text-txt-muted">No listening ports detected</span></Td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ==== Throughput: live 60s + history ==== */
interface LivePoint {
  ts: number;
  rx: number;
  tx: number;
}

function ThroughputSection({ data }: { data: ReturnType<typeof useSystemData>["data"] }) {
  const n = data?.network;
  const [range, setRange] = useState<Timeframe>("1h");
  const samples = useHistory(range);
  const historyData = samples.map((s) => ({ ts: s.ts, rx: s.rx_rate, tx: s.tx_rate }));

  // Live buffer: poll the cheap /api/throughput endpoint every 2s while mounted
  const [live, setLive] = useState<LivePoint[]>([]);
  const liveRef = useRef<LivePoint[]>([]);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/throughput");
        const d = await r.json();
        if (!active) return;
        const next = [...liveRef.current, { ts: d.ts, rx: d.rxRate, tx: d.txRate }].slice(-30);
        liveRef.current = next;
        setLive(next);
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const latest = live[live.length - 1];

  return (
    <section className="space-y-3">
      <h2 className="section-label">Throughput</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Live last 60s */}
        <div className="card px-4 py-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold text-txt-secondary">Live</span>
              <span className="text-[10px] text-txt-muted">last 60 s{n?.throughput.interface ? ` on ${n.throughput.interface}` : ""}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-txt-muted">
                ↓ <span className="data-value font-semibold text-success">{latest ? `${formatBytes(latest.rx)}/s` : "—"}</span>
              </span>
              <span className="text-[10px] text-txt-muted">
                ↑ <span className="data-value font-semibold text-accent">{latest ? `${formatBytes(latest.tx)}/s` : "—"}</span>
              </span>
            </div>
          </div>
          <LiveChart points={live} />
          <div className="flex items-center gap-3 mt-1.5">
            <LegendChip color="var(--success)" label="Download" />
            <LegendChip color="var(--accent)" label="Upload" />
            <span className="text-[10px] text-txt-muted ml-auto">
              Session totals: ↓ {n ? formatBytes(n.throughput.rxBytes) : "—"} · ↑ {n ? formatBytes(n.throughput.txBytes) : "—"}
            </span>
          </div>
        </div>

        {/* History */}
        <div className="card px-4 py-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold text-txt-secondary">History</span>
              <LegendChip color="var(--success)" label="Download" />
              <LegendChip color="var(--accent)" label="Upload" />
            </div>
            <TimeframePills value={range} onChange={setRange} />
          </div>
          <HistoryChart
            data={historyData}
            series={[
              { key: "rx", name: "Download", color: "var(--success)" },
              { key: "tx", name: "Upload", color: "var(--accent)" },
            ]}
            range={range}
            height={150}
            formatValue={(v) => `${formatBytes(Math.max(v, 0))}/s`}
            formatAxis={(v) => compactBytes(Math.max(v, 0))}
          />
        </div>
      </div>
    </section>
  );
}

/* Live area chart — plain Recharts, no axes clutter, 60s window */
function LiveChart({ points }: { points: LivePoint[] }) {
  if (points.length < 2) {
    return (
      <div className="h-[130px] flex items-center justify-center text-[11px] text-txt-muted">
        Sampling…
      </div>
    );
  }
  return (
    <div className="h-[130px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="live-rx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="live-tx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" hide type="number" domain={["dataMin", "dataMax"]} />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            labelFormatter={(ts) => new Date(ts as number).toLocaleTimeString(undefined, { hour12: false })}
            formatter={(value, name) => [`${formatBytes(value as number)}/s`, name as string]}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--text-primary)",
            }}
            isAnimationActive={false}
          />
          <Area type="monotone" dataKey="rx" name="Download" stroke="var(--success)" strokeWidth={1.5}
            fill="url(#live-rx)" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="tx" name="Upload" stroke="var(--accent)" strokeWidth={1.5}
            fill="url(#live-tx)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ==== Devices on the LAN (SK Net) ==== */
function DevicesSection() {
  const { data, isLoading } = useSWR<{
    devices: LanDevice[];
    subnet: string;
    interface: string;
    scannedAt: number;
  }>("/api/devices", fetcher, { refreshInterval: 120_000, revalidateOnFocus: false });

  const devices = data?.devices ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-label">Devices on Network</h2>
        <span className="text-[11px] text-txt-muted">
          {data ? (
            <>
              <span className="data-value font-semibold text-txt-primary">{devices.length}</span>
              {" "}devices on {data.subnet} · scanned {new Date(data.scannedAt).toLocaleTimeString(undefined, { hour12: false })}
            </>
          ) : (
            "Scanning network…"
          )}
        </span>
      </div>
      <div className="card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead>
              <tr className="border-b border-line-dim">
                <Th>Device</Th>
                <Th>IP Address</Th>
                <Th>MAC Address</Th>
                <Th>Vendor</Th>
                <Th>Identified via</Th>
              </tr>
            </thead>
            <tbody>
              {devices.length > 0 ? (
                devices.map((d) => (
                  <tr key={d.ip} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                    <Td>
                      <span className={`font-semibold ${d.self ? "text-accent" : d.name ? "text-txt-primary" : "text-txt-muted"}`}>
                        {d.name || "Unknown device"}
                      </span>
                      {d.self && <span className="ml-1.5 text-[10px] text-txt-muted">(this server)</span>}
                    </Td>
                    <Td><span className="data-value">{d.ip}</span></Td>
                    <Td><span className="data-value text-txt-muted">{d.mac || "—"}</span></Td>
                    <Td>{d.vendor || "—"}</Td>
                    <Td>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-elevated text-txt-secondary">
                        {d.source}
                      </span>
                    </Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <Td colSpan={5}>
                    <span className="text-txt-muted">
                      {isLoading || !data ? "Scanning the local network — first scan takes a few seconds…" : "No devices found"}
                    </span>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-txt-muted">
        Active ARP sweep of the local subnet. Sleeping devices may not respond; Apple devices using
        private Wi-Fi addresses show as &quot;Private address&quot;. Name stable devices in{" "}
        <span className="code-inline">sentinel.config.json</span> under <span className="code-inline">network.knownDevices</span>.
      </p>
    </section>
  );
}

/* ---- IP Card ---- */
function IpCard({ label, ip, description, accent }: {
  label: string; ip: string; description: string; accent?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (ip === "—") return;
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="card px-4 py-3.5">
      <div className="text-[10px] text-txt-muted mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className={`data-value text-lg font-bold ${accent ? "text-accent" : "text-txt-primary"}`}>
          {ip}
        </div>
        {ip !== "—" && (
          <button
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy to clipboard"}
            className="text-txt-muted hover:text-accent transition-colors flex-shrink-0 p-0.5"
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 8 6 12 14 4" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1" />
                <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div className="text-[11px] text-txt-muted mt-1">{description}</div>
    </div>
  );
}

/* ---- Table Primitives ---- */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted bg-surface-elevated">
      {children}
    </th>
  );
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td className="px-4 py-2.5 text-xs text-txt-secondary" colSpan={colSpan}>
      {children}
    </td>
  );
}
