import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted Manrope (bundled by Vite, served same-origin → CSP-compliant, no
// Google Fonts request). Weights used by the "Studio" redesign: 400–800.
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import App from "./presentation/App.jsx";
import ErrorBoundary from "./presentation/components/ErrorBoundary.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
