/** The theme tokens (src/styles/theme.css) as the utility vocabulary the approved screens use. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        ok: { DEFAULT: "hsl(var(--ok))", foreground: "hsl(var(--ok-foreground))" },
        mid: { DEFAULT: "hsl(var(--mid))", foreground: "hsl(var(--mid-foreground))" },
        hot: { DEFAULT: "hsl(var(--hot))", foreground: "hsl(var(--hot-foreground))" },
      },
      borderRadius: { md: "var(--radius)", lg: "calc(var(--radius) + 2px)", sm: "calc(var(--radius) - 1px)" },
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
        mono: "var(--font-mono)",
      },
    },
  },
  plugins: [],
};
