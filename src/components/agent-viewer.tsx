"use client";

import { useEffect, useState } from "react";

// VNC endpoint comes from sentinel.config.json (browserAgent.vncUrl) so no
// deployment-specific host ever lives in the source.

export function AgentViewer({
  onScrollToChat,
  active,
}: {
  onScrollToChat: () => void;
  active: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [vncUrl, setVncUrl] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((cfg) => setVncUrl(cfg.browserAgent?.vncUrl || ""))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full w-full max-w-[1400px] mx-auto gap-3">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onScrollToChat}
            className="flex items-center gap-2 text-[11px] text-txt-muted hover:text-accent transition-colors group"
          >
            <span className="text-base group-hover:-translate-y-0.5 transition-transform">↑</span>
            <span>back to chat</span>
          </button>
          <span className="text-txt-muted">·</span>
          <h2 className="font-display text-sm font-semibold tracking-tight text-txt-primary">
            Live browser stream
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <div className="flex items-center gap-2">
              <span
                className={`status-dot ${loaded ? "status-dot-online status-dot-pulse" : "status-dot-offline"}`}
              />
              <span className="text-[11px] text-txt-muted">
                {loaded ? "Connected" : "Connecting…"}
              </span>
            </div>
          )}
          {vncUrl && (
          <a
            href={vncUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-txt-muted hover:text-accent transition-colors"
            title="Open VNC in a new tab"
          >
            ↗ pop out
          </a>
          )}
        </div>
      </div>

      {/* VIEWER */}
      <div
        className="flex-1 rounded-2xl overflow-hidden relative"
        style={{
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--shadow-glow), var(--shadow-md)",
          background: "var(--bg-surface)",
        }}
      >
        {active && !vncUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-txt-muted px-6 text-center">
            <p className="text-[12px]">No VNC endpoint configured.</p>
            <p className="text-[11px]">
              Set <span className="code-inline">browserAgent.vncUrl</span> in{" "}
              <span className="code-inline">sentinel.config.json</span> to stream the browser here.
            </p>
          </div>
        ) : !active ? (
          // Placeholder shown before any run has started — keeps the viewer
          // section inert so snap-mandatory doesn't pull scroll here on load.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-txt-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <p className="text-[12px]">Live view will appear here when a task starts</p>
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                <div className="text-[12px] text-txt-muted">Starting VNC session…</div>
              </div>
            )}
            <iframe
              src={vncUrl}
              onLoad={() => setLoaded(true)}
              className="w-full h-full block"
              title="Browser agent live view"
              allow="clipboard-read; clipboard-write"
            />
          </>
        )}
      </div>
    </div>
  );
}
