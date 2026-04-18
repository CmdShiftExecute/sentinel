"use client";

import clsx from "clsx";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: "success" | "warning" | "danger" | "neutral";
  sublabel?: string;
  children?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  status = "neutral",
  sublabel,
  children,
  className,
}: MetricCardProps) {
  return (
    <div className={clsx("card px-4 py-3.5", className)}>
      <div className="section-label mb-2">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx("data-value text-2xl font-bold", {
            "text-success": status === "success",
            "text-warning": status === "warning",
            "text-danger": status === "danger",
            "text-txt-primary": status === "neutral",
          })}
          style={status === "neutral" ? { textShadow: "0 0 20px oklch(0.78 0.148 185 / 0.35)" } : undefined}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs text-txt-muted font-medium">{unit}</span>
        )}
      </div>
      {sublabel && (
        <p className="text-[11px] text-txt-secondary mt-1">{sublabel}</p>
      )}
      {children}
    </div>
  );
}
