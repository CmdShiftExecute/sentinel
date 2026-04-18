"use client";

import { useEffect, useState } from "react";
import type { SentinelConfig, WatchUnit } from "@/lib/config";

const EMPTY_UNIT: WatchUnit = { unit: "", userUnit: false, label: "" };

export default function SettingsPage() {
  const [config, setConfig] = useState<SentinelConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Failed to load settings"));
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateUnit(i: number, patch: Partial<WatchUnit>) {
    if (!config) return;
    const units = config.services.watchUnits.map((u, idx) =>
      idx === i ? { ...u, ...patch } : u
    );
    setConfig({ ...config, services: { watchUnits: units } });
  }

  function addUnit() {
    if (!config) return;
    setConfig({
      ...config,
      services: { watchUnits: [...config.services.watchUnits, { ...EMPTY_UNIT }] },
    });
  }

  function removeUnit(i: number) {
    if (!config) return;
    const units = config.services.watchUnits.filter((_, idx) => idx !== i);
    setConfig({ ...config, services: { watchUnits: units } });
  }

  function addExcludePath() {
    if (!config) return;
    setConfig({
      ...config,
      markdown: { ...config.markdown, extraExcludePaths: [...config.markdown.extraExcludePaths, ""] },
    });
  }

  function updateExcludePath(i: number, value: string) {
    if (!config) return;
    const paths = config.markdown.extraExcludePaths.map((p, idx) => (idx === i ? value : p));
    setConfig({ ...config, markdown: { ...config.markdown, extraExcludePaths: paths } });
  }

  function removeExcludePath(i: number) {
    if (!config) return;
    setConfig({
      ...config,
      markdown: { ...config.markdown, extraExcludePaths: config.markdown.extraExcludePaths.filter((_, idx) => idx !== i) },
    });
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-txt-muted">{error || "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold tracking-tight">Settings</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-success">Saved</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
            style={{
              background: saving ? "var(--bg-surface)" : "var(--accent)",
              color: saving ? "var(--text-muted)" : "oklch(0.12 0.02 185)",
              boxShadow: saving ? "none" : "0 0 12px oklch(0.78 0.148 185 / 0.4)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Vault */}
      <SettingsSection title="Vault" description="Primary knowledge base / Obsidian vault path tracked for git commits.">
        <Field label="Vault Path">
          <input
            type="text"
            value={config.vault.primaryPath}
            onChange={(e) => setConfig({ ...config, vault: { primaryPath: e.target.value } })}
            placeholder="/home/user/vaults/MyVault"
            className="settings-input"
          />
        </Field>
      </SettingsSection>

      {/* Markdown */}
      <SettingsSection title="Markdown Scanning" description="Scan for loose markdown files outside the vault.">
        <Field label="Enable scanning">
          <Toggle
            checked={config.markdown.enabled}
            onChange={(v) => setConfig({ ...config, markdown: { ...config.markdown, enabled: v } })}
          />
        </Field>
        {config.markdown.enabled && (
          <Field label="Extra exclude paths">
            <div className="space-y-2">
              {config.markdown.extraExcludePaths.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => updateExcludePath(i, e.target.value)}
                    placeholder="/home/user/skip-this"
                    className="settings-input flex-1"
                  />
                  <button onClick={() => removeExcludePath(i)} className="settings-remove-btn">✕</button>
                </div>
              ))}
              <button onClick={addExcludePath} className="settings-add-btn">+ Add path</button>
            </div>
          </Field>
        )}
      </SettingsSection>

      {/* Services */}
      <SettingsSection title="Watched Services" description="systemd units whose start events appear in Server Logs.">
        <div className="space-y-2">
          {config.services.watchUnits.map((u, i) => (
            <div key={i} className="flex gap-2 items-center p-3 rounded-lg"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}>
              <input
                type="text"
                value={u.unit}
                onChange={(e) => updateUnit(i, { unit: e.target.value })}
                placeholder="unit name"
                className="settings-input-sm flex-[2]"
              />
              <input
                type="text"
                value={u.label}
                onChange={(e) => updateUnit(i, { label: e.target.value })}
                placeholder="display label"
                className="settings-input-sm flex-[3]"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-txt-muted cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={u.userUnit}
                  onChange={(e) => updateUnit(i, { userUnit: e.target.checked })}
                  className="accent-teal-400"
                />
                user
              </label>
              <button onClick={() => removeUnit(i)} className="settings-remove-btn shrink-0">✕</button>
            </div>
          ))}
          <button onClick={addUnit} className="settings-add-btn">+ Add service</button>
        </div>
        <p className="text-[11px] text-txt-muted mt-2">
          "user" = <code className="code-inline">--user-unit</code> flag for journalctl (user-space systemd services).
        </p>
      </SettingsSection>

      {/* Hardware */}
      <SettingsSection title="Hardware" description="Show or hide hardware panels.">
        <Field label="Show battery section">
          <Toggle
            checked={config.hardware.showBattery}
            onChange={(v) => setConfig({ ...config, hardware: { showBattery: v } })}
          />
        </Field>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card px-5 py-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-txt-primary">{title}</h2>
        <p className="text-[11px] text-txt-muted mt-0.5">{description}</p>
      </div>
      <div className="border-t border-line-dim pt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0"
      style={{
        background: checked ? "var(--accent)" : "var(--bg-surface)",
        border: "1px solid " + (checked ? "var(--accent)" : "var(--border)"),
        boxShadow: checked ? "0 0 8px oklch(0.78 0.148 185 / 0.4)" : "none",
      }}
    >
      <span
        className="absolute top-0.5 rounded-full w-4 h-4 transition-transform duration-200"
        style={{
          background: checked ? "oklch(0.12 0.02 185)" : "var(--text-muted)",
          transform: checked ? "translateX(17px)" : "translateX(1px)",
        }}
      />
    </button>
  );
}
