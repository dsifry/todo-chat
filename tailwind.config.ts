import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
