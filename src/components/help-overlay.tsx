"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid oklch(0.78 0.148 185 / 0.2)",
          boxShadow: "0 24px 80px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(0.78 0.148 185 / 0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 pt-5 pb-4"
          style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-dim)" }}>
          <div>
            <h2 className="font-display text-base font-bold text-txt-primary">Sentinel Help</h2>
            <p className="text-[11px] text-txt-muted mt-0.5">Server monitoring dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Platform support */}
          <Section title="Platform Support">
            <p className="text-[13px] text-txt-secondary leading-relaxed">
              Sentinel runs on <strong className="text-txt-primary">Linux</strong> and <strong className="text-txt-primary">macOS</strong>.
              Most metrics use the Node.js <code className="code-inline">os</code> module (cross-platform).
              Some features degrade gracefully on macOS:
            </p>
            <ul className="mt-2 space-y-1">
              <HelpItem label="journalctl events" note="Linux only — macOS falls back to empty" />
              <HelpItem label="systemd service status" note="Linux only" />
              <HelpItem label="Battery info" note="macOS: pmset · Linux: upower / sysfs" />
              <HelpItem label="CPU temp" note="macOS: osx-cpu-temp · Linux: sensors / sysfs" />
              <HelpItem label="fail2ban / dpkg logs" note="Linux only" />
            </ul>
          </Section>

          {/* Pages */}
          <Section title="Pages">
            <ul className="space-y-1.5">
              <HelpItem label="Overview" note="CPU, memory, disk, uptime at a glance" />
              <HelpItem label="Hardware" note="Battery, temperature, processes, swap" />
              <HelpItem label="Network" note="Interfaces, connections, IP addresses" />
              <HelpItem label="Security" note="SSH logins, fail2ban, open ports" />
              <HelpItem label="Services" note="systemd unit status + start history" />
              <HelpItem label="Server Logs" note="Aggregated activity timeline" />
              <HelpItem label="Settings" note="Configure vault path, services, battery display" />
            </ul>
          </Section>

          {/* Activity collector */}
          <Section title="Activity Collector">
            <p className="text-[13px] text-txt-secondary leading-relaxed">
              Server Logs and service events require the Python daemon running alongside Sentinel:
            </p>
            <pre className="mt-2 px-3 py-2 rounded-lg text-[11px] text-txt-secondary overflow-x-auto"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}>
{`cd /path/to/sentinel
python3 activity-collector.py &`}
            </pre>
            <p className="text-[11px] text-txt-muted mt-2">
              Or run via systemd/launchd for persistent collection. Configure the vault path and watched services in <strong className="text-txt-secondary">Settings</strong>.
            </p>
          </Section>

          {/* Keyboard shortcuts */}
          <Section title="Keyboard Shortcuts">
            <ul className="space-y-1.5">
              <ShortcutItem keys={["?"]} label="Open / close this help overlay" />
              <ShortcutItem keys={["Esc"]} label="Close overlay / dismiss modals" />
            </ul>
          </Section>

          {/* Config */}
          <Section title="Configuration File">
            <p className="text-[13px] text-txt-secondary leading-relaxed">
              Settings are stored in <code className="code-inline">sentinel.config.json</code> at the project root.
              This file is gitignored — your personal paths and service names stay local.
              Copy <code className="code-inline">sentinel.config.example.json</code> to get started.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="section-label mb-2">{title}</h3>
      {children}
    </div>
  );
}

function HelpItem({ label, note }: { label: string; note: string }) {
  return (
    <li className="flex items-baseline gap-2 text-[12px]">
      <span className="font-semibold text-txt-primary shrink-0">{label}</span>
      <span className="text-txt-muted">— {note}</span>
    </li>
  );
}

function ShortcutItem({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <div className="flex gap-1">
        {keys.map((k) => (
          <kbd key={k} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-txt-secondary"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 1px 0 var(--border)" }}>
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-txt-muted">{label}</span>
    </li>
  );
}
