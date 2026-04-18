"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { HelpOverlay } from "./help-overlay";
import { useSystemData } from "@/hooks/use-system-data";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: IconGrid },
  { href: "/hardware", label: "Hardware", icon: IconCpu },
  { href: "/network", label: "Network", icon: IconGlobe },
  { href: "/security", label: "Security", icon: IconShield },
  { href: "/services", label: "Services", icon: IconBox },
  { href: "/activity", label: "Server Logs", icon: IconActivity },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data } = useSystemData(30_000);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* ===== Desktop Sidebar ===== */}
      <aside
        className="hidden md:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col z-40"
        style={{
          background: "var(--sidebar-bg)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderRight: "1px solid oklch(0.78 0.148 185 / 0.1)",
          boxShadow: "inset -1px 0 0 oklch(0 0 0 / 0.2), 4px 0 24px oklch(0 0 0 / 0.3)",
        }}
      >
        {/* Server Identity */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0"
              style={{ boxShadow: "0 0 8px var(--accent)" }} />
            <span className="font-display font-bold text-sm tracking-tight text-txt-primary truncate">
              {data?.hostname || "sentinel"}
            </span>
          </div>
          <p className="text-[11px] text-txt-muted pl-[18px] truncate">
            {data?.os?.name || "Server"} {data?.os?.version ? `${data.os.version}` : ""}
          </p>
        </div>

        <div className="divider-accent mx-5" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href} className="relative">
                  {active && <span className="nav-item-active-bar" />}
                  <Link
                    href={href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2 rounded text-[13px] font-medium transition-all duration-150",
                      active
                        ? "bg-accent-surface text-accent"
                        : "text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
                    )}
                    style={active ? { boxShadow: "inset 0 0 12px oklch(0.78 0.148 185 / 0.08)" } : undefined}
                  >
                    <Icon size={16} active={active} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom: Status + Theme + Help */}
        <div className="px-5 pb-5 space-y-4">
          <div className="divider-accent" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={clsx(
                "status-dot",
                data ? "status-dot-online status-dot-pulse" : "status-dot-offline"
              )} />
              <span className="text-[11px] text-txt-muted">
                {data ? "Connected" : "Offline"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHelpOpen(true)}
                title="Help (?)"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
              >
                <span className="text-[11px] font-bold">?</span>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* ===== Mobile Top Header ===== */}
      <header
        className="md:hidden fixed top-0 left-0 z-50 flex items-center justify-between px-4 h-12 w-screen"
        style={{
          background: "var(--sidebar-bg)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderBottom: "1px solid oklch(0.78 0.148 185 / 0.1)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              "status-dot",
              data ? "status-dot-online status-dot-pulse" : "status-dot-offline"
            )}
          />
          <span className="font-display font-bold text-[13px] tracking-tight text-txt-primary truncate max-w-[200px]">
            {data?.hostname || "sentinel"}
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      <nav
        className="md:hidden fixed bottom-0 left-0 z-50 flex items-center justify-around w-screen"
        style={{
          background: "var(--sidebar-bg)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderTop: "1px solid oklch(0.78 0.148 185 / 0.1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-0.5 py-2 px-2 min-w-[52px] rounded-lg transition-all duration-150",
                active ? "text-accent bg-accent-surface" : "text-txt-muted"
              )}
            >
              <Icon size={20} active={active} />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/* --- Inline SVG Icons --- */
function IconGrid({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}
function IconCpu({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" />
      <line x1="6" y1="1" x2="6" y2="3" /><line x1="10" y1="1" x2="10" y2="3" />
      <line x1="6" y1="13" x2="6" y2="15" /><line x1="10" y1="13" x2="10" y2="15" />
      <line x1="1" y1="6" x2="3" y2="6" /><line x1="1" y1="10" x2="3" y2="10" />
      <line x1="13" y1="6" x2="15" y2="6" /><line x1="13" y1="10" x2="15" y2="10" />
    </svg>
  );
}
function IconGlobe({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <circle cx="8" cy="8" r="6.5" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.5" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}
function IconShield({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
    </svg>
  );
}
function IconBox({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <path d="M1.5 5L8 1.5 14.5 5 8 8.5z" />
      <path d="M1.5 5v6L8 14.5" /><path d="M14.5 5v6L8 14.5" />
      <line x1="8" y1="8.5" x2="8" y2="14.5" />
    </svg>
  );
}
function IconActivity({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <circle cx="8" cy="8" r="6.5" />
      <polyline points="8,4.5 8,8 10.5,9.5" />
    </svg>
  );
}
function IconSettings({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.6 }}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M12.6 3.4l-.85.85M4.25 11.75l-.85.85" />
    </svg>
  );
}
