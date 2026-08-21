"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AGENT_MODELS,
  DEFAULT_MODEL_ID,
  computeCost,
  formatCost,
  formatPrice,
  type AgentModel,
  type AgentTone,
} from "@/lib/browser-agent-models";

type LogLine = { id: number; text: string };
type Status = "idle" | "running" | "done" | "error";
type Tokens = { in: number; out: number; reasoning: number; calls: number };

const ZERO_TOKENS: Tokens = { in: 0, out: 0, reasoning: 0, calls: 0 };

const TONE_STYLES: Record<AgentTone, { bg: string; fg: string; dot: string; label: string }> = {
  gold:   { bg: "rgba(244,197,66,0.14)",  fg: "#f4c542", dot: "#f4c542", label: "Gold" },
  silver: { bg: "rgba(200,205,214,0.18)", fg: "#c8cdd6", dot: "#c8cdd6", label: "Silver" },
  bronze: { bg: "rgba(208,136,96,0.18)",  fg: "#d08860", dot: "#d08860", label: "Bronze" },
  cn:     { bg: "var(--accent-surface)",  fg: "var(--accent)", dot: "var(--accent)", label: "Qwen" },
  west:   { bg: "var(--bg-hover)",        fg: "var(--text-secondary)", dot: "var(--text-muted)", label: "West" },
};

const MEDAL: Record<AgentTone, string> = { gold: "🥇", silver: "🥈", bronze: "🥉", cn: "•", west: "•" };

export function AgentChat({ onScrollToViewer }: { onScrollToViewer: () => void }) {
  const [task, setTask] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [tokens, setTokens] = useState<Tokens>(ZERO_TOKENS);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Starts at 0, not Date.now(): this page is prerendered, so a clock read
  // during render is taken at BUILD time and then disagrees with the client on
  // hydration — which is what threw React #418/#423/#425 here. `now` only feeds
  // `elapsed`, which stays 0 until a run sets startedAt, so 0 is not just safe
  // but exactly what the first paint should show.
  const [now, setNow] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  const selectedModel: AgentModel = useMemo(
    () => AGENT_MODELS.find((m) => m.id === model) ?? AGENT_MODELS[0],
    [model],
  );
  const selectedTone = TONE_STYLES[selectedModel.tone];

  const cost = useMemo(() => computeCost(tokens, selectedModel), [tokens, selectedModel]);

  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 100) / 10) : 0;

  const pushLog = useCallback((text: string) => {
    setLogs((prev) => [...prev, { id: ++logIdRef.current, text }]);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const copyLogs = useCallback(async () => {
    if (logs.length === 0) return;
    const text = logs.map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }, [logs]);

  const run = useCallback(async () => {
    if (!task.trim() || status === "running") return;
    setLogs([]);
    setTokens(ZERO_TOKENS);
    setExitCode(null);
    setStatus("running");
    const t = Date.now();
    setStartedAt(t);
    // Seed the clock with the same instant so the first elapsed reading is
    // correct rather than waiting up to 250ms for the interval's first tick.
    setNow(t);
    onScrollToViewer();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/browser-agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), model }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "request failed");
        pushLog(`[error] ${msg}`);
        setStatus("error");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const raw of events) {
          const lines = raw.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (event === "log") {
            pushLog(data.replace(/\\n/g, "\n"));
          } else if (event === "tokens") {
            try {
              const parsed = JSON.parse(data) as Partial<Tokens>;
              setTokens({
                in: parsed.in ?? 0,
                out: parsed.out ?? 0,
                reasoning: parsed.reasoning ?? 0,
                calls: parsed.calls ?? 0,
              });
            } catch {
              /* malformed token event — ignore */
            }
          } else if (event === "done") {
            try {
              const parsed = JSON.parse(data);
              setExitCode(parsed.exitCode ?? 0);
              setStatus(parsed.exitCode === 0 ? "done" : "error");
            } catch {
              setStatus("done");
            }
          } else if (event === "error") {
            pushLog(`[error] ${data}`);
            setStatus("error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        pushLog(`[error] ${(err as Error).message}`);
        setStatus("error");
      } else {
        pushLog("[stopped]");
        setStatus("idle");
      }
    }
  }, [task, model, status, pushLog, onScrollToViewer]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };

  const hasTokens = tokens.calls > 0;

  return (
    <div className="flex flex-col h-full w-full max-w-[1100px] mx-auto gap-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight title-caret">Browser Agent</h1>
          <p className="text-[12px] text-txt-muted mt-0.5">
            Ask the agent to browse, click, and report back. Watch it live below.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <StatusPill status={status} />
          {status === "running" && startedAt && (
            <span className="data-value text-[11px] text-txt-muted tabular-nums">
              {elapsed.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* CHAT INPUT */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(14px) saturate(1.35)",
          WebkitBackdropFilter: "blur(14px) saturate(1.35)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tell the agent what to do.   e.g. Go to Hacker News and return the top 3 stories with point counts."
          rows={3}
          disabled={status === "running"}
          className={clsx(
            "w-full resize-none bg-transparent outline-none text-sm leading-relaxed",
            "placeholder:text-txt-muted",
            status === "running" && "opacity-60 cursor-not-allowed",
          )}
          style={{ color: "var(--text-primary)" }}
        />
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between pt-2 border-t border-line-dim">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] uppercase tracking-wider text-txt-muted font-semibold">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={status === "running"}
              className="bg-surface border border-line rounded px-2 py-1 text-[12px] text-txt-primary outline-none focus:border-accent transition-colors max-w-[360px]"
            >
              {AGENT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {MEDAL[m.tone]} {m.label} · {m.provider} · {formatPrice(m)}
                </option>
              ))}
            </select>
            {/* Medal / tone badge for currently selected */}
            <span
              className="text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider flex items-center gap-1.5"
              style={{ background: selectedTone.bg, color: selectedTone.fg }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: selectedTone.dot, boxShadow: `0 0 6px ${selectedTone.dot}` }}
              />
              {selectedTone.label}
            </span>
            {/* Price chip */}
            <span className="text-[10px] font-mono text-txt-muted px-2 py-0.5 rounded bg-surface-hover tracking-tight">
              {formatPrice(selectedModel)}
            </span>
            {selectedModel.note && (
              <span className="text-[10px] text-txt-muted italic hidden md:inline">
                {selectedModel.note}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status === "running" ? (
              <button
                onClick={stop}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-danger-surface text-danger hover:brightness-110 transition"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!task.trim()}
                className={clsx(
                  "px-5 py-2 rounded-lg text-[13px] font-bold transition-all",
                  "bg-accent text-bg-root hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                style={{ boxShadow: "var(--shadow-glow-strong)" }}
              >
                Run · <span className="opacity-70 font-normal">⌘↩</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LOG STREAM */}
      <div className="relative flex-1 min-h-[180px]">
        <button
          onClick={copyLogs}
          disabled={logs.length === 0}
          aria-label="Copy log output"
          title={copied ? "Copied" : "Copy log"}
          className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: copied ? "var(--accent-surface)" : "var(--bg-surface-hover, var(--bg-surface))",
            borderColor: "var(--glass-border)",
            color: copied ? "var(--accent)" : "var(--text-secondary)",
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      <div
        ref={logBoxRef}
        className="absolute inset-0 rounded-xl p-3 overflow-y-auto font-mono text-[11.5px] leading-[1.55] border border-line-dim"
        style={{
          background: "var(--bg-surface)",
          scrollbarWidth: "thin",
        }}
      >
        {logs.length === 0 && status === "idle" && (
          <div className="text-txt-muted text-[12px] p-2">
            Log stream will appear here. Tip: press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-surface-hover text-txt-secondary text-[10px]">?</kbd>{" "}
            for keyboard shortcuts.
          </div>
        )}
        {logs.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-words text-txt-secondary">
            {l.text}
          </div>
        ))}
        {status === "done" && exitCode === 0 && (
          <div className="mt-2 text-success">✓ task finished (exit 0)</div>
        )}
        {status === "error" && (
          <div className="mt-2 text-danger">✗ task failed{exitCode !== null ? ` (exit ${exitCode})` : ""}</div>
        )}
      </div>
      </div>

      {/* TOKEN / COST METER — contrasting row, visible in both themes */}
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 border"
        style={{
          background: "var(--accent-surface)",
          borderColor: "var(--glass-border)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex items-center gap-3 flex-wrap text-[11.5px] font-mono tabular-nums">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>
            Tokens
          </span>
          <TokenStat label="↓" ariaLabel="input tokens" value={tokens.in} active={hasTokens} />
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <TokenStat label="↑" ariaLabel="output tokens" value={tokens.out} active={hasTokens} />
          {tokens.reasoning > 0 && (
            <>
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <TokenStat label="reasoning" ariaLabel="reasoning tokens" value={tokens.reasoning} active={hasTokens} />
            </>
          )}
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span style={{ color: hasTokens ? "var(--text-primary)" : "var(--text-muted)" }}>
            {tokens.calls} {tokens.calls === 1 ? "call" : "calls"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>
            Cost
          </span>
          <span
            className="font-display font-bold text-[17px] tabular-nums"
            style={{
              color: hasTokens ? "var(--accent)" : "var(--text-muted)",
              textShadow: hasTokens ? "0 0 10px var(--accent-surface)" : "none",
            }}
          >
            {formatCost(cost)}
          </span>
        </div>
      </div>

      {/* SCROLL HINT */}
      <button
        onClick={onScrollToViewer}
        className="self-center flex items-center gap-2 text-[11px] text-txt-muted hover:text-accent transition-colors py-2 group"
      >
        <span>scroll to watch live</span>
        <span className="text-base group-hover:translate-y-0.5 transition-transform">↓</span>
      </button>
    </div>
  );
}

function TokenStat({
  label,
  ariaLabel,
  value,
  active,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  active: boolean;
}) {
  const isArrow = label === "↑" || label === "↓";
  return (
    <span aria-label={ariaLabel}>
      <span
        aria-hidden="true"
        className={isArrow ? "text-[13px] font-bold" : "text-[10px] uppercase tracking-wider"}
        style={{ color: "var(--text-secondary)", marginRight: "0.2em" }}
      >
        {label}
      </span>
      <span style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}>
        {value.toLocaleString()}
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map = {
    idle: { dot: "status-dot-offline", label: "idle", cls: "text-txt-muted" },
    running: { dot: "status-dot-online status-dot-pulse", label: "running", cls: "text-accent" },
    done: { dot: "status-dot-online", label: "done", cls: "text-success" },
    error: { dot: "status-dot-offline", label: "error", cls: "text-danger" },
  } as const;
  const s = map[status];
  return (
    <div className="flex items-center gap-2">
      <span className={clsx("status-dot", s.dot)} />
      <span className={clsx("text-[11px] uppercase font-semibold tracking-wider", s.cls)}>
        {s.label}
      </span>
    </div>
  );
}
