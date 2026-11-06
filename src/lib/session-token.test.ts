import { expect, it } from "vitest";
import { readSession, signSession } from "./session-token";

it("rejects forged, expired and malformed sessions", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const secret = "test-secret-with-at-least-32-characters";
  const now = 1800000000000;
  const token = signSession(id, secret, now);
  expect(readSession(token, secret, now)).toBe(id);
  expect(
    readSession(token.replace(id, id.replace(/1$/, "2")), secret, now),
  ).toBeNull();
  expect(readSession(token, "another-secret", now)).toBeNull();
  expect(readSession(token, secret, now + 12 * 60 * 60 * 1000)).toBeNull();
  for (const bad of ["", "a.b.c", token + ".extra", token.slice(0, -1)])
    expect(readSession(bad, secret, now)).toBeNull();
});
