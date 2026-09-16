import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f6fb",
        accent: { DEFAULT: "#3f37c9", dark: "#332bb0", soft: "#eceefe" },
      },
    },
  },
  plugins: [],
} satisfies Config;
