import { afterEach, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { orderTracking } from "./order-tracking";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("encodes only the HTTPS tracking URL and keeps the token in the fragment", async () => {
  vi.stubEnv("TRACKING_BASE_URL", "https://guests.example/");
  const encoder = vi.spyOn(QRCode, "toDataURL");
  const token = "ab".repeat(32);
  const tracking = await orderTracking(
    token,
    "http://localhost:3000/api/counter/orders",
  );
  expect(tracking.tracking_url).toBe(`https://guests.example/o/track#${token}`);
  expect(encoder).toHaveBeenCalledWith(
    tracking.tracking_url,
    expect.objectContaining({ margin: 4 }),
  );
  expect(tracking.tracking_qr).toMatch(/^data:image\/png;base64,/);
  expect(new URL(tracking.tracking_url!).pathname).not.toContain(token);
});

it("falls back to the HTTPS app origin and returns the same link on retry", async () => {
  vi.stubEnv("TRACKING_BASE_URL", "");
  const token = "cd".repeat(32);
  const first = await orderTracking(
    token,
    "https://booth.example/api/counter/orders",
  );
  expect(first.tracking_url).toBe(`https://booth.example/o/track#${token}`);
  expect(
    await orderTracking(token, "https://booth.example/api/counter/orders"),
  ).toEqual(first);
});

it("never presents insecure or malformed tracking links, or leaks encoder errors", async () => {
  vi.stubEnv("TRACKING_BASE_URL", "");
  expect(
    (await orderTracking("ab".repeat(32), "http://localhost:3000"))
      .tracking_url,
  ).toBeNull();
  expect(
    (await orderTracking("bad", "https://booth.example")).tracking_url,
  ).toBeNull();
  vi.spyOn(QRCode, "toDataURL").mockRejectedValueOnce(
    new Error("private token"),
  );
  const result = await orderTracking("ab".repeat(32), "https://booth.example");
  expect(result.tracking_url).toBeNull();
  expect(result.tracking_warning).toContain("Order saved");
  expect(JSON.stringify(result)).not.toContain("private token");
});
