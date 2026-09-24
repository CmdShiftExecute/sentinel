import clsx from "clsx";
import type { ThrottleState } from "@/lib/types";

/* Is the CPU throttling right now? The CPU's own answer (live status bits,
 * read by the root power sampler), shown in strong red when it is, calm when
 * it is not, and never a guess from temperature. */
export function ThrottleFlag({ t, size = "sm" }: { t?: ThrottleState; size?: "sm" | "lg" }) {
  const big = size === "lg";
  const title = t
    ? `${t.source === "msr" ? "CPU status bits, live" : t.source === "counters" ? "Kernel throttle counter" : "No source"}` +
      (t.events != null ? ` · ${t.events} throttle events since boot, ${((t.totalMs ?? 0) / 1000).toFixed(2)} s in total` : "")
    : undefined;
  if (!t || t.active == null) {
    return <span className={clsx("text-txt-muted", big ? "text-xs" : "text-[10px]")} title={title}>Throttle state unknown</span>;
  }
  if (t.active) {
    return (
      <span title={title} className={clsx("inline-flex items-center gap-1.5 font-extrabold uppercase tracking-wider text-danger", big ? "text-sm" : "text-[11px]")}>
        <span className="status-dot status-dot-offline status-dot-pulse" style={{ background: "var(--danger)" }} />
        Throttling
      </span>
    );
  }
  if (t.powerLimit) {
    return (
      <span title={`${title} · clocked down by a power limit, not by heat`} className={clsx("inline-flex items-center gap-1.5 font-bold text-warning", big ? "text-sm" : "text-[11px]")}>
        Power-limited
      </span>
    );
  }
  return (
    <span title={title} className={clsx("inline-flex items-center gap-1.5 font-semibold text-success", big ? "text-xs" : "text-[10px]")}>
      Not throttling
    </span>
  );
}
