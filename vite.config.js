import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// [Critical #2 fix] Without an explicit `base`, assets resolve relative to
// the domain root ("/assets/..."), which breaks on GitHub Pages project
// sites served from a subpath ("https://<user>.github.io/EduVerify-PNG/").
// Set VITE_BASE_PATH in CI (or leave the default below) to match your repo
// name if you fork this under a different name.
export default defineConfig({
  plugins: [react()],
  base:  process.env.VITE_BASE_PATH || "/EduVerify-PNG-Prototype/",
  server: {
    proxy: {
      // In dev, forward API calls to the local Express backend proxy
      // (see /server) so the browser never needs the SevisPass client secret.
      "/api": "http://localhost:8787",
    },
  },
});
