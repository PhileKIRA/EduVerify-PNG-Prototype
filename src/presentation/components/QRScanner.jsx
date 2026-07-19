/* ============================================================
   PRESENTATION TIER — live camera QR scanner (html5-qrcode).
   Opens the device camera and calls onScan(decodedText) on the first
   successful read, then stops. Tries the rear camera first (phones),
   then falls back to the front/any camera (laptops & desktops).
   Fails gracefully if no camera exists or permission is denied.
   ============================================================ */
import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";
import { useC } from "../theme";
import { Btn } from "./ui";

const READER_ID = "ev-qr-reader";
const SCAN_CONFIG = { fps: 10, qrbox: { width: 240, height: 240 } };

export default function QRScanner({ onScan, onClose }) {
  const C = useC();
  const [err, setErr] = useState(null);
  const [starting, setStarting] = useState(true);
  /* keep the latest callbacks in refs so the effect runs exactly once */
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let cancelled = false;
    let started = false;
    const scanner = new Html5Qrcode(READER_ID, { verbose: false });

    const stop = () => {
      if (started) {
        started = false;
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };

    const onDecoded = (decodedText) => {
      if (!cancelled) {
        cancelled = true; // one result only
        stop();
        onScanRef.current(decodedText);
      }
    };

    const tryStart = async () => {
      /* rear camera first (phones/tablets), then front, then any camera the
         browser can give us (desktop webcams) */
      const attempts = [{ facingMode: "environment" }, { facingMode: "user" }];
      try {
        const cams = await Html5Qrcode.getCameras();
        if (cams && cams.length) attempts.push(cams[0].id);
      } catch { /* getCameras needs permission on some browsers — the facingMode attempts still work */ }
      let lastErr = null;
      for (const constraint of attempts) {
        if (cancelled) return;
        try {
          await scanner.start(constraint, SCAN_CONFIG, onDecoded, () => {});
          started = true;
          if (!cancelled) setStarting(false);
          return;
        } catch (e) { lastErr = e; }
      }
      if (!cancelled) {
        setStarting(false);
        setErr((lastErr && lastErr.message) || "Couldn't open a camera. Check camera permission (and use HTTPS or localhost), or paste the token instead.");
      }
    };

    tryStart();
    return () => { cancelled = true; stop(); };
  }, []);

  return (
    <div style={{ marginBottom: 14 }}>
      <div id={READER_ID}
           style={{ width: "100%", maxWidth: 340, margin: "0 auto", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.lineStrong}`, background: C.surface2, minHeight: err ? 0 : 120 }} />
      <p className="text-xs mt-2 text-center" style={{ color: err ? C.red : C.muted }}>
        {err || (starting ? "Opening camera… allow camera access if prompted." : "Point your camera at the QR code — it verifies automatically.")}
      </p>
      <div className="flex justify-center mt-1">
        <Btn small kind="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
}
