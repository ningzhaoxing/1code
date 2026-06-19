/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        "min-420": "420px",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        "tl-background": "hsl(var(--tl-background))",
        "input-background": "hsl(var(--input-background))",
        "plan-mode": {
          DEFAULT: "hsl(var(--plan-mode))",
          foreground: "hsl(var(--plan-mode-foreground))",
        },
        "state-lead": "hsl(var(--state-lead))",
        "state-candidate": "hsl(var(--state-candidate))",
        "state-validated": "hsl(var(--state-validated))",
        "state-dismissed": "hsl(var(--state-dismissed))",
        "state-needs-human": "hsl(var(--state-needs-human))",
        "sev-critical": "hsl(var(--sev-critical))",
        "sev-high": "hsl(var(--sev-high))",
        "sev-medium": "hsl(var(--sev-medium))",
        "sev-low": "hsl(var(--sev-low))",
        "reach-on": "hsl(var(--reach-on))",
        "reach-off": "hsl(var(--reach-off))",
        "tool-running": "hsl(var(--tool-running))",
        "tool-success": "hsl(var(--tool-success))",
        "tool-fail": "hsl(var(--tool-fail))",
        approval: {
          DEFAULT: "hsl(var(--approval))",
          armed: "hsl(var(--approval-armed))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "IBM Plex Mono",
          "var(--font-geist-mono)",
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("tailwindcss-animate"), require("@tailwindcss/container-queries")],
}
