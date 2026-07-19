/* ============================================================
   PRESENTATION TIER — ErrorBoundary.
   Catches any uncaught render error and shows a recoverable screen instead
   of a blank white page. (Class component — can't use the theme hook, so the
   fallback renders in the light palette.)
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
    console.error("EduVerify PNG — uncaught error:", error, info);
  }
  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT, padding: 24 }}>
        <div style={{ maxWidth: 460, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 28, textAlign: "center", boxShadow: C.shadow }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>
            EduVerify PNG hit an unexpected error. Reloading resets the demo.
          </p>
          {this.state.error && (
            <pre style={{ textAlign: "left", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: 11, color: C.red, overflowX: "auto", marginBottom: 16 }}>
              {String(this.state.error.message || this.state.error)}
            </pre>
          )}
          <button onClick={this.handleReset}
            style={{ background: C.gold, color: "#14110C", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
