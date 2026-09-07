/**
 * Renders a value as a QR code image.
 *
 * Used for two things that must be scannable rather than merely present: the
 * IRP's signed QR on a printed invoice (GST rules require the *image* on the
 * document, not the JWT text), and the otpauth URL an authenticator app enrols
 * from. Rendered to a data URL so it prints and survives copy/paste; the
 * `<img>` is given an `alt` so the value is not lost to assistive technology.
 */

import { useEffect, useState } from "react";
import QRCodeLib from "qrcode";

interface QrCodeProps {
  value: string;
  /** Rendered pixel size; the image is square. */
  size?: number;
  alt: string;
  className?: string;
}

export function QrCode({ value, size = 160, alt, className }: QrCodeProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    // The signed QR is a multi-kilobyte JWT; medium error correction keeps the
    // module count within what a phone camera reads at print size.
    QRCodeLib.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: size })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <span className="muted small" role="img" aria-label={alt}>
        QR code could not be rendered (value too long).
      </span>
    );
  }
  if (!src) return <span className={className} style={{ display: "inline-block", width: size, height: size }} aria-hidden />;
  return <img src={src} width={size} height={size} alt={alt} className={className} />;
}
