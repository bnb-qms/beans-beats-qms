import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { GuestStatusView } from "./guest-status";
import { initialGuestState, type GuestTrackingState } from "./watch-order";
import type { GuestOrder } from "@/lib/guest-order";

function renderState(
  result: GuestTrackingState,
  sample = false,
  qr: string | null = null,
) {
  return renderToStaticMarkup(
    createElement(GuestStatusView, { result, sample, qr, onRefresh() {} }),
  );
}

function orderState(status: GuestOrder["status"]): GuestTrackingState {
  return {
    ...initialGuestState,
    kind: "order",
    order: { order_number: 12, event_day: "2026-11-07", status },
    lastUpdated: Date.UTC(2026, 10, 7, 2),
  };
}

function render(
  status: "ready" | "preparing" | "collected" | "cancelled",
  reconnecting = false,
  qr: string | null = null,
) {
  return renderState({ ...orderState(status), reconnecting }, false, qr);
}

it("shows a persistent, accessible Ready message with the actual pickup number", () => {
  const html = render("ready");
  expect(html).toContain("Order #12 is ready. Please collect at the booth.");
  expect(html).toContain("bg-signal");
  expect(html).toContain('aria-live="polite" aria-atomic="true"');
});

it.each(["preparing", "collected", "cancelled"] as const)(
  "removes the pickup prompt and Ready background for %s",
  (status) => {
    const html = render(status);
    expect(html).not.toContain("is ready. Please collect");
    expect(html).not.toContain("bg-signal");
    if (status === "collected")
      expect(html).toContain("Your pickup is complete");
  },
);

it("keeps changing timestamps and reconnecting notices outside the Ready live region", () => {
  const html = render("ready", true);
  const liveRegion = html.match(
    /<section[^>]*aria-live="polite"[\s\S]*?<\/section>/,
  )?.[0];
  expect(liveRegion).toContain("Order #12 is ready");
  expect(liveRegion).not.toContain("Last confirmed update");
  expect(liveRegion).not.toContain("Reconnecting");
  expect(html).toContain("Reconnecting — status may be out of date");
  expect(html).toContain('dateTime="2026-11-07T02:00:00.000Z"');
});

it("shows a neutral loading state without order data and disables the refresh", () => {
  const html = renderState(initialGuestState);
  expect(html).toContain("Loading order…");
  expect(html).toContain("Checking your order’s confirmed status.");
  expect(html).toContain('disabled=""');
  expect(html).toContain("Refresh status");
  expect(html).not.toContain("Pickup number");
});

it("offers a retry for a failed connection without technical details", () => {
  const html = renderState({ ...initialGuestState, kind: "error" });
  expect(html).toContain("Connection unavailable");
  expect(html).toContain(
    "We could not check your order. Retrying when connected.",
  );
  expect(html).toContain("Retry status");
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain("Pickup number");
});

it("tells guests with an unavailable or expired link to ask counter staff, with no retry", () => {
  const html = renderState({ ...initialGuestState, kind: "unavailable" });
  expect(html).toContain("Order unavailable");
  expect(html).toContain(
    "This tracking link is unavailable or has expired. Please check with counter staff.",
  );
  expect(html).not.toContain("<button");
  expect(html).not.toContain("Pickup number");
});

it("labels the sample page and never claims live updates for it", () => {
  const html = renderState(orderState("queued"), true);
  expect(html).toContain("Sample data");
  expect(html).not.toContain("Updates automatically");
});

it("says a live page updates automatically while visible", () => {
  const html = renderState(orderState("queued"));
  expect(html).toContain("Updates automatically while this page is visible.");
  expect(html).not.toContain("Sample data");
});

it("keeps the privacy notice visible in every guest state", () => {
  for (const html of [
    renderState(initialGuestState),
    renderState({ ...initialGuestState, kind: "error" }),
    renderState({ ...initialGuestState, kind: "unavailable" }),
    renderState(orderState("ready")),
  ]) {
    expect(html).toContain("Your privacy");
    expect(html).toContain(
      "deleted within 30 days after the event ends on 29 November 2026",
    );
  }
});

it.each([
  ["preparing", true],
  ["ready", true],
  ["collected", false],
  ["cancelled", false],
] as const)("shows the collection QR for %s: %s", (status, shown) => {
  const html = render(status, false, "data:image/png;base64,QR");
  expect(html.includes("data:image/png;base64,QR")).toBe(shown);
  expect(html.includes("Show this QR at the pickup screen")).toBe(shown);
});

it("keeps small labels readable on the orange Ready screen", () => {
  expect(render("ready")).toContain("[&amp;_.eyebrow]:text-ink");
  expect(render("preparing")).not.toContain("[&amp;_.eyebrow]:text-ink");
});
