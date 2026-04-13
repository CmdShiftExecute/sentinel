"use client";

import { useSystemData } from "@/hooks/use-system-data";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes } from "@/lib/utils";

export default function NetworkPage() {
  const { data } = useSystemData();
  const n = data?.network;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">Network</h1>

      {/* IP Addresses */}
      <section className="space-y-3">
        <h2 className="section-label">IP Addresses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up stagger-1">
          <IpCard label="LAN IP" ip={n?.lanIp || "—"} description="Local network address" />
          <IpCard label="External IP" ip={n?.externalIp || "—"} description="Public-facing address" />
          <IpCard label="TailScale IP" ip={n?.tailscaleIp || "—"} description="VPN mesh address" accent />
        </div>
      </section>

      {/* Network Details */}
      <section className="space-y-3">
        <h2 className="section-label">Network Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up stagger-2">
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

      {/* Throughput */}
      {n?.throughput && (
        <section className="space-y-3">
          <h2 className="section-label">Throughput</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-up stagger-3">
            <div className="card px-4 py-3.5">
              <div className="text-[10px] text-txt-muted mb-1">Download</div>
              <div className="data-value text-lg font-bold text-success">
                {n.throughput.rxRate > 0 ? `${formatBytes(n.throughput.rxRate)}/s` : "—"}
              </div>
              <div className="text-[10px] text-txt-muted mt-1">Total: {formatBytes(n.throughput.rxBytes)}</div>
            </div>
            <div className="card px-4 py-3.5">
              <div className="text-[10px] text-txt-muted mb-1">Upload</div>
              <div className="data-value text-lg font-bold text-accent">
                {n.throughput.txRate > 0 ? `${formatBytes(n.throughput.txRate)}/s` : "—"}
              </div>
              <div className="text-[10px] text-txt-muted mt-1">Total: {formatBytes(n.throughput.txBytes)}</div>
            </div>
            <div className="card px-4 py-3.5">
              <div className="text-[10px] text-txt-muted mb-1">Interface</div>
              <div className="data-value text-sm font-bold text-txt-primary">{n.throughput.interface}</div>
              <div className="text-[10px] text-txt-muted mt-1">Primary adapter</div>
            </div>
          </div>
        </section>
      )}

      {/* Interfaces */}
      <section className="space-y-3">
        <h2 className="section-label">Network Interfaces</h2>
        <div className="card-static overflow-hidden animate-fade-up stagger-4">
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
            </span>
          )}
        </div>
        <div className="card-static overflow-hidden animate-fade-up stagger-5">
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

/* ---- IP Card ---- */
function IpCard({ label, ip, description, accent }: {
  label: string; ip: string; description: string; accent?: boolean;
}) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[10px] text-txt-muted mb-1">{label}</div>
      <div className={`data-value text-lg font-bold ${accent ? "text-accent" : "text-txt-primary"}`}>
        {ip}
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
