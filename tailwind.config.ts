import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Quicksand", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)", 3: "var(--surface-3)" },
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
        muted: "var(--muted)",
        brand: { DEFAULT: "var(--brand)", ink: "var(--brand-ink)", tint: "var(--brand-tint)", line: "var(--brand-line)", on: "var(--on-brand)" },
        info: { DEFAULT: "var(--info)", ink: "var(--info-ink)", tint: "var(--info-tint)", line: "var(--info-line)", on: "var(--on-info)" },
        ok: { DEFAULT: "var(--ok)", fill: "var(--ok-fill)", tint: "var(--ok-tint)" },
        warn: { DEFAULT: "var(--warn)", fill: "var(--warn-fill)", tint: "var(--warn-tint)" },
        crit: { DEFAULT: "var(--crit)", fill: "var(--crit-fill)", tint: "var(--crit-tint)" },
        grid: "var(--grid)",
      },
      borderRadius: { DEFAULT: "var(--radius)", sm: "var(--radius-sm)" },
      boxShadow: { card: "var(--shadow)", lg: "var(--shadow-lg)" },
    },
  },
  plugins: [animate],
} satisfies Config;
