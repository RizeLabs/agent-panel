/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: "#0a0a0f",
          surface: "#12121a",
          border: "#1e1e2e",
          accent: "#7c3aed",
          "accent-hover": "#6d28d9",
          text: "#e2e8f0",
          "text-dim": "#64748b",
          success: "#22c55e",
          warning: "#eab308",
          error: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
