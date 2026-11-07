import { TRACKING_TOKEN } from "./guest-order";

export type ScanResult =
  "collected" | "already_collected" | "not_ready" | "cancelled";

export type ScanOutcome = {
  result: ScanResult;
  order_number: number;
  customer_first_name: string;
};

export type ReadyCode = {
  code_hash: string;
  order_number: number;
  customer_first_name: string;
};

const RESULTS: readonly string[] = [
  "collected",
  "already_collected",
  "not_ready",
  "cancelled",
];

/** The tracking code from a guest or receipt QR (`…/o/track#<code>`), or null for any other QR. */
export function trackingCodeFromQr(text: string): string | null {
  const trimmed = text.trim();
  if (TRACKING_TOKEN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const code = url.hash.slice(1);
    return url.pathname === "/o/track" && TRACKING_TOKEN.test(code)
      ? code
      : null;
  } catch {
    return null;
  }
}

/** SHA-256 hex, matching `encode(extensions.digest(code, 'sha256'), 'hex')` in the database. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isOrderSummary(value: unknown): value is {
  order_number: number;
  customer_first_name: string;
} {
  const v = value as { order_number?: unknown; customer_first_name?: unknown };
  return (
    !!v &&
    Number.isSafeInteger(v.order_number) &&
    (v.order_number as number) > 0 &&
    typeof v.customer_first_name === "string"
  );
}

export function isScanOutcome(value: unknown): value is ScanOutcome {
  return (
    isOrderSummary(value) &&
    RESULTS.includes((value as { result?: unknown }).result as string)
  );
}

export function parseReadyCodes(value: unknown): ReadyCode[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(
    (v) =>
      isOrderSummary(v) &&
      typeof (v as ReadyCode).code_hash === "string" &&
      /^[0-9a-f]{64}$/.test((v as ReadyCode).code_hash),
  )
    ? (value as ReadyCode[])
    : null;
}

/** "#12 Mei", or "#12" when the order has no name. */
export function orderLabel(order: {
  order_number: number;
  customer_first_name: string;
}): string {
  const name = order.customer_first_name.trim();
  return name ? `#${order.order_number} ${name}` : `#${order.order_number}`;
}
