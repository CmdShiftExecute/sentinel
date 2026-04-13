import clsx from "clsx";

type Variant = "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  variant: Variant;
  label: string;
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-surface-elevated text-txt-secondary",
};

export function StatusBadge({ variant, label, pulse, className }: StatusBadgeProps) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium",
      variantStyles[variant],
      className
    )}>
      <span className={clsx(
        "status-dot",
        variant === "success" && "status-dot-online",
        variant === "warning" && "status-dot-warning",
        variant === "danger" && "status-dot-offline",
        variant === "neutral" && "bg-txt-muted",
        pulse && "status-dot-pulse"
      )} />
      {label}
    </span>
  );
}
