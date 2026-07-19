import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  // Base path depends on where it's hosted:
  //   - GitHub Pages project site   -> served under /EduVerify-PNG/ (default)
  //   - Render / Vercel / root domain -> served at "/" (these set RENDER / VERCEL)
  // Override explicitly with BASE_PATH if needed.
  base: process.env.BASE_PATH || (process.env.RENDER || process.env.VERCEL ? "/" : "/EduVerify-PNG/"),
  plugins: [react()],
  server: {
    host: true, // lets you open the dev server from your phone on the same Wi-Fi
    // Proxy API calls to the Node/Express backend during local development so the
    // browser only ever talks to the frontend origin (no CORS gymnastics, and the
    // client secret stays server-side).
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
