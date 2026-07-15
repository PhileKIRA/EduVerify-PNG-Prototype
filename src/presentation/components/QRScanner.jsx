import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef } from "react";

export default function QRScanner({ onScan }) {
  const scannerRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: {
              width: 250,
              height: 250,
            },
          },
          (decodedText) => {
            onScan(decodedText);

            if (startedRef.current) {
              scanner.stop()
                .then(() => {
                  startedRef.current = false;
                  scanner.clear();
                })
                .catch(() => {});
            }
          },
          () => {
            // Ignore scan errors
          }
        );

        startedRef.current = true;

      } catch (error) {
        console.error("Camera start error:", error);
      }
    };

    startScanner();

    return () => {
      if (startedRef.current) {
        scanner.stop()
          .then(() => {
            scanner.clear();
          })
          .catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div
      id="qr-reader"
      style={{
        width: "100%",
        maxWidth: "400px",
        margin: "20px auto",
      }}
    />
  );
}