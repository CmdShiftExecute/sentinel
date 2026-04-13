"use client";

import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded text-txt-secondary hover:text-txt-primary hover:bg-surface-hover transition-all duration-150"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3.5" />
          <line x1="8" y1="1" x2="8" y2="2.5" />
          <line x1="8" y1="13.5" x2="8" y2="15" />
          <line x1="1" y1="8" x2="2.5" y2="8" />
          <line x1="13.5" y1="8" x2="15" y2="8" />
          <line x1="3.05" y1="3.05" x2="4.11" y2="4.11" />
          <line x1="11.89" y1="11.89" x2="12.95" y2="12.95" />
          <line x1="3.05" y1="12.95" x2="4.11" y2="11.89" />
          <line x1="11.89" y1="4.11" x2="12.95" y2="3.05" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 8.5a5.5 5.5 0 01-7.37-5.13A5.5 5.5 0 108.5 14a5.5 5.5 0 005-5.5z" />
        </svg>
      )}
    </button>
  );
}
