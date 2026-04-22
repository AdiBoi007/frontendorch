import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        doc: ["15px", { lineHeight: "1.75" }],
        docSm: ["14px", { lineHeight: "1.7" }],
        label: ["11px", { lineHeight: "1.25", letterSpacing: "0.12em" }],
        meta: ["12px", { lineHeight: "1.4" }]
      },
      colors: {
        bg: "var(--bg)",
        bg1: "var(--bg-1)",
        bg2: "var(--bg-2)",
        border: "var(--border)",
        sidebar: "var(--sidebar)",
        teal: "var(--teal)",
        tealDim: "var(--teal-dim)",
        accent: "var(--accent)",
        highlight: "var(--highlight)",
        callout: "var(--callout)",
        orange: "var(--orange)",
        purple: "var(--purple)",
        red: "var(--red)",
        mint: "var(--mint)",
        lavender: "var(--lavender)",
        peach: "var(--peach)",
        text1: "var(--text-1)",
        textBody: "var(--text-body)",
        text2: "var(--text-2)",
        text3: "var(--text-3)"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        bebas: ["Inter", "system-ui", "sans-serif"],
        syne: ["Inter", "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
