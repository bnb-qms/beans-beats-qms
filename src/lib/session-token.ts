import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "./order";

export function signSession(
  id: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = `${id}.${Math.floor(now / 1000) + 12 * 60 * 60}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function readSession(
  token: string,
  secret: string,
  now = Date.now(),
): string | null {
  const [id, expiry, signature, extra] = token.split(".");
  if (
    extra ||
    !UUID.test(id ?? "") ||
    !/^\d+$/.test(expiry ?? "") ||
    !/^[a-f0-9]{64}$/.test(signature ?? "") ||
    Number(expiry) <= now / 1000
  )
    return null;
  const expected = createHmac("sha256", secret)
    .update(`${id}.${expiry}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? id : null;
}
