import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          root: "var(--bg-root)",
          card: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          hover: "var(--bg-hover)",
          active: "var(--bg-active)",
        },
        line: {
          DEFAULT: "var(--border)",
          dim: "var(--border-dim)",
        },
        txt: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          dim: "var(--accent-dim)",
          bright: "var(--accent-bright)",
          surface: "var(--accent-surface)",
        },
        success: {
          DEFAULT: "var(--success)",
          surface: "var(--success-surface)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          surface: "var(--warning-surface)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          surface: "var(--danger-surface)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ['"SF Mono"', '"Cascadia Code"', '"Fira Code"', "monospace"],
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        subtle: "var(--shadow-sm)",
        mid: "var(--shadow-md)",
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        lg: "8px",
      },
      animation: {
        "fade-up": "fade-up 500ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 400ms ease both",
        "slide-in": "slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
