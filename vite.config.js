import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  // Serve at root by default (local development and the single-service backend).
  // For GitHub Pages use: BASE_PATH=/EduVerify-PNG/ npm run build
  base: process.env.BASE_PATH || "/",
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
