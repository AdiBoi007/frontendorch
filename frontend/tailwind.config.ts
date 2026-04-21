import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bg1: "var(--bg-1)",
        bg2: "var(--bg-2)",
        border: "var(--border)",
        teal: "var(--teal)",
        tealDim: "var(--teal-dim)",
        orange: "var(--orange)",
        purple: "var(--purple)",
        red: "var(--red)",
        mint: "var(--mint)",
        lavender: "var(--lavender)",
        peach: "var(--peach)",
        text1: "var(--text-1)",
        text2: "var(--text-2)",
        text3: "var(--text-3)"
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', "sans-serif"],
        syne: ["Syne", "sans-serif"],
        mono: ['"DM Mono"', "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
