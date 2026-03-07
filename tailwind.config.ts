import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./modules/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          muted: "hsl(var(--surface-muted))"
        },
        border: "hsl(var(--border))",
        text: {
          DEFAULT: "hsl(var(--text))",
          muted: "hsl(var(--text-muted))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        ring: "hsl(var(--ring))",
        destructive: "hsl(var(--destructive))",
        success: "hsl(var(--success))"
      },
      borderRadius: {
        card: "var(--radius)",
        control: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        card: "var(--shadow)",
        floating: "var(--shadow)"
      }
    }
  },
  plugins: []
};

export default config;
