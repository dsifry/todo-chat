import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [typography],
};

export default config;
