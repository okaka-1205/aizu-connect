import { useEffect, useState } from "react";

export function CheckInQrCode({
  eventId,
  code,
}: {
  eventId: string;
  code: string;
}) {
  const key = JSON.stringify([eventId, code]);
  const [result, setResult] = useState<{
    key: string;
    imageUrl: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.origin);
    url.searchParams.set("checkInEvent", eventId);
    url.searchParams.set("checkInCode", code);
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url.toString(), {
          width: 280,
          margin: 2,
          color: { dark: "#1c2735", light: "#fffefa" },
          errorCorrectionLevel: "M",
        }),
      )
      .then((imageUrl) => {
        if (!cancelled) setResult({ key, imageUrl });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, imageUrl: null });
      });
    return () => {
      cancelled = true;
    };
  }, [code, eventId, key]);

  if (!result || result.key !== key) return null;
  if (!result.imageUrl) {
    return (
      <span role="status">
        QRコードを表示できません。6桁の受付コードをご利用ください。
      </span>
    );
  }

  return (
    <img
      className="check-in-qr"
      src={result.imageUrl}
      alt={`${eventId}の受付QRコード`}
    />
  );
}
