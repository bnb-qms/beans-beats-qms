import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ScanResult } from "./scanner";

it("shows a green tick for a collected order", () => {
  const html = renderToStaticMarkup(
    createElement(ScanResult, {
      shown: {
        tone: "collected",
        title: "#12 Mei",
        detail: "Enjoy your drink!",
      },
    }),
  );
  expect(html).toContain("bg-collected");
  expect(html).toContain("✓");
  expect(html).toContain("#12 Mei");
  expect(html).toContain('aria-live="assertive"');
});

it("shows amber with a symbol and text, not colour alone, when staff must check", () => {
  const html = renderToStaticMarkup(
    createElement(ScanResult, {
      shown: {
        tone: "check",
        title: "Not ready yet",
        detail: "Watch the board.",
      },
    }),
  );
  expect(html).toContain("bg-check");
  expect(html).toContain("!");
  expect(html).toContain("Not ready yet");
});

it("renders nothing while waiting for a scan", () => {
  const html = renderToStaticMarkup(createElement(ScanResult, { shown: null }));
  expect(html).not.toContain("bg-collected");
  expect(html).not.toContain("bg-check");
});
