import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function CheckInQrCode({
  eventId,
  code,
}: {
  eventId: string;
  code: string;
}) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    const url = new URL(window.location.origin);
    url.searchParams.set("checkInEvent", eventId);
    url.searchParams.set("checkInCode", code);
    void QRCode.toDataURL(url.toString(), {
      width: 280,
      margin: 2,
      color: { dark: "#1c2735", light: "#fffefa" },
      errorCorrectionLevel: "M",
    }).then(setImageUrl);
  }, [code, eventId]);

  return imageUrl ? (
    <img
      className="check-in-qr"
      src={imageUrl}
      alt={`${eventId}の受付QRコード`}
    />
  ) : null;
}
