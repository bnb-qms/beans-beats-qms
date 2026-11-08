import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { GuestStatusView } from "./guest-status";
import { initialGuestState, type GuestTrackingState } from "./watch-order";

function render(
  status: "ready" | "preparing" | "collected" | "cancelled",
  reconnecting = false,
  qr: string | null = null,
) {
  const result: GuestTrackingState = {
    ...initialGuestState,
    kind: "order",
    order: { order_number: 12, event_day: "2026-11-07", status },
    lastUpdated: Date.UTC(2026, 10, 7, 2),
    reconnecting,
  };
  return renderToStaticMarkup(
    createElement(GuestStatusView, {
      result,
      sample: false,
      qr,
      onRefresh() {},
    }),
  );
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
