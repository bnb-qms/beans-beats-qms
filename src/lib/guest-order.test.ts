import { expect, it } from "vitest";
import { guestStatuses, isGuestOrder, TRACKING_TOKEN } from "./guest-order";

it("accepts only full tracking credentials, not pickup numbers or order IDs", () => {
  expect(TRACKING_TOKEN.test("a1".repeat(32))).toBe(true);
  for (const token of [
    "",
    "12",
    "a".repeat(63),
    "A".repeat(64),
    "00000000-0000-4000-8000-000000000001",
  ])
    expect(TRACKING_TOKEN.test(token)).toBe(false);
});

it("validates confirmed status responses and maps every database status", () => {
  for (const status of Object.keys(guestStatuses))
    expect(
      isGuestOrder({ order_number: 12, event_day: "2026-11-07", status }),
    ).toBe(true);
  for (const status of ["unknown", "toString", "__proto__"])
    expect(
      isGuestOrder({ order_number: 12, event_day: "2026-11-07", status }),
    ).toBe(false);
  expect(isGuestOrder(null)).toBe(false);
  expect(
    isGuestOrder({ order_number: 0, event_day: "bad", status: "ready" }),
  ).toBe(false);
});
