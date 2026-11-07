import QRCode from "qrcode";
import { TRACKING_TOKEN } from "./guest-order";

export async function orderTracking(token: unknown, requestUrl: string) {
  try {
    if (typeof token !== "string" || !TRACKING_TOKEN.test(token))
      throw new Error();
    const base = new URL(process.env.TRACKING_BASE_URL || requestUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new Error();
    // Fragments stay out of page-request logs and HTTP referrers.
    const url = new URL(`/o/track#${token}`, base.origin).href;
    return {
      tracking_url: url,
      tracking_qr: await QRCode.toDataURL(url, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: "M",
      }),
      tracking_warning: null,
    };
  } catch {
    // The order already committed: QR failure must never look like a failed sale.
    return {
      tracking_url: null,
      tracking_qr: null,
      tracking_warning:
        "Order saved. Tracking QR is unavailable. Keep the pickup number and ask the booth lead to check the HTTPS tracking address.",
    };
  }
}
