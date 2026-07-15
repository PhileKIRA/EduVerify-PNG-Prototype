/* ============================================================
   PRESENTATION TIER — ErrorBoundary.

   [Important #12 fix] The original prototype had no error boundary: any
   uncaught error in a component (a bad date, an undefined field on a
   malformed record, etc.) blanked the entire app to a white screen with no
   explanation. This wraps the app and shows a recoverable error screen
   instead.
   ============================================================ */
import React from "react";
import { C, FONT } from "../theme.js";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In a production build this is where you'd forward to a logging service.
    console.error("EduVerify PNG — uncaught error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Full reload is the safest recovery for a prototype with in-memory state.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.paper, fontFamily: FONT, padding: 24 }}>
        <div style={{ maxWidth: 480, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: C.inkSoft, fontSize: 14, marginBottom: 16 }}>
            EduVerify PNG hit an unexpected error and had to stop. This is a Phase 1 prototype — all data is in-memory, so a reload will reset the demo but shouldn't lose anything important.
          </p>
          {this.state.error && (
            <pre style={{ textAlign: "left", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, fontSize: 11, color: C.red, overflowX: "auto", marginBottom: 16 }}>
              {String(this.state.error.message || this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{ background: C.gold, color: C.ink, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
