"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTheme, PALETTES } from "@/hooks/use-theme";

// Accent palette picker: a swatch button opening a compact popover of the six
// theme-factory palettes. Persists via useTheme (localStorage + data-palette).
export function PalettePicker() {
  const { palette, setPalette, mounted } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Accent palette"
        title="Accent palette"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded text-txt-secondary hover:text-txt-primary hover:bg-surface-hover transition-all duration-150"
      >
        <span
          className="w-3.5 h-3.5 rounded-full"
          style={{
            background: "var(--accent)",
            boxShadow: "0 0 6px color-mix(in oklab, var(--accent) 60%, transparent)",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute bottom-10 left-0 z-50 card-static p-1.5 w-[168px] animate-fade-up"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPalette(p.id);
                setOpen(false);
              }}
              className={clsx(
                "w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors duration-150",
                p.id === palette
                  ? "bg-accent-surface text-accent"
                  : "text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
              )}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: p.swatch }}
              />
              <span className="text-[11px] font-medium truncate">{p.name}</span>
              {p.id === palette && (
                <span className="ml-auto text-[10px] data-value">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
