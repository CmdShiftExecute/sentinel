"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface GaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  color?: string;
  className?: string;
}

export function Gauge({
  value,
  max = 100,
  size = 120,
  strokeWidth = 7,
  label,
  sublabel,
  color = "var(--accent)",
  className,
}: GaugeProps) {
  const [animated, setAnimated] = useState(0);
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min((animated / max) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;
  const center = size / 2;

  useEffect(() => {
    const start = Date.now();
    const duration = 1200;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimated(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);

  const displayValue = Math.round(animated);

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke="var(--border-dim)"
          strokeWidth={strokeWidth}
        />
        {/* Value arc */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: "stroke-dashoffset 100ms ease",
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
        {/* Center value */}
        <text
          x={center} y={center - 4}
          textAnchor="middle"
          dominantBaseline="central"
          className="data-value"
          style={{
            fill: "var(--text-primary)",
            fontSize: size > 100 ? "1.5rem" : "1.125rem",
            fontWeight: 700,
          }}
        >
          {displayValue}
          <tspan style={{ fontSize: "0.65em", fontWeight: 500 }}>%</tspan>
        </text>
        {/* Label */}
        <text
          x={center} y={center + (size > 100 ? 18 : 14)}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fill: "var(--text-muted)",
            fontSize: "0.6rem",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </text>
      </svg>
      {sublabel && (
        <span className="text-[11px] text-txt-secondary mt-1">{sublabel}</span>
      )}
    </div>
  );
}
