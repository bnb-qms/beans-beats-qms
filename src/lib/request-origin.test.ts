import { expect, it } from "vitest";
import { sameRequestOrigin } from "./request-origin";

it("validates the browser's Origin against Host even when Next normalises the URL", () => {
  const request = (origin?: string, host = "127.0.0.1:3047") =>
    new Request("http://localhost:3047/api/staff/session", {
      headers: { host, ...(origin ? { origin } : {}) },
    });
  expect(sameRequestOrigin(request("http://127.0.0.1:3047"))).toBe(true);
  expect(sameRequestOrigin(request("https://booth.test", "booth.test"))).toBe(
    true,
  );
  for (const origin of [
    undefined,
    "null",
    "https://attacker.test",
    "http://127.0.0.1:3048",
    "http://127.0.0.1:3047/",
    "file://127.0.0.1:3047",
  ])
    expect(sameRequestOrigin(request(origin))).toBe(false);
});
