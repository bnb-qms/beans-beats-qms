import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BaristaQueueView,
  readCachedQueue,
  writeCachedQueue,
} from "./barista-queue";
import type { QueueOrder } from "@/lib/queue";

const sampleOrders: QueueOrder[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    order_number: 14,
    event_day: "2026-11-26",
    customer_first_name: "Mei",
    status: "queued",
    created_at: "2026-11-26T02:00:00.000Z",
    version: 1,
    items: [
      {
        id: "00000000-0000-4000-8000-000000000011",
        menu_item_name: "latte",
        quantity: 2,
        add_ons: ["iced", "oat milk"],
      },
      {
        id: "00000000-0000-4000-8000-000000000012",
        menu_item_name: "espresso",
        quantity: 1,
        add_ons: [],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    order_number: 15,
    event_day: "2026-11-26",
    customer_first_name: "Arjun",
    status: "preparing",
    created_at: "2026-11-26T02:03:00.000Z",
    version: 2,
    items: [
      {
        id: "00000000-0000-4000-8000-000000000013",
        menu_item_name: "flat white",
        quantity: 1,
        add_ons: [],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    order_number: 16,
    event_day: "2026-11-26",
    customer_first_name: "Siti",
    status: "ready",
    created_at: "2026-11-26T02:05:00.000Z",
    version: 3,
    items: [
      {
        id: "00000000-0000-4000-8000-000000000014",
        menu_item_name: "americano",
        quantity: 2,
        add_ons: ["iced"],
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BaristaQueueView", () => {
  it("renders order number, customer name, drink details, and Queued/Preparing/Ready status in sequence", () => {
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: sampleOrders,
        connected: true,
        error: "",
        onRetry() {},
      }),
    );
    expect(html).toContain("14");
    expect(html).toContain("Mei");
    expect(html).toContain("Queued");
    expect(html).toContain("2×");
    expect(html).toContain("Latte · Iced · Oat");
    expect(html).toContain("1×");
    expect(html).toContain("Espresso · Hot");

    expect(html).toContain("15");
    expect(html).toContain("Arjun");
    expect(html).toContain("Preparing");
    expect(html).toContain("Flat white · Hot");

    expect(html).toContain("16");
    expect(html).toContain("Siti");
    expect(html).toContain("Ready");
    expect(html).toContain("border-signal");
    expect(html).toContain("Americano · Iced");

    expect(html.indexOf("Mei")).toBeLessThan(html.indexOf("Arjun"));
    expect(html.indexOf("Arjun")).toBeLessThan(html.indexOf("Siti"));
  });

  it("keeps previously loaded orders visible with an offline notice when disconnected", () => {
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: sampleOrders,
        connected: false,
        error: "No connection. Previously loaded orders remain visible.",
        onRetry() {},
      }),
    );
    expect(html).toContain("Offline · showing last loaded orders");
    expect(html).toContain(
      "No connection. Previously loaded orders remain visible.",
    );
    expect(html).toContain("Mei");
    expect(html).toContain("Latte · Iced · Oat");
  });

  it("renders an empty message when there are no pending orders", () => {
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: [],
        connected: true,
        error: "",
        onRetry() {},
      }),
    );
    expect(html).toContain("No pending orders in the queue.");
  });
});

describe("sessionStorage offline cache", () => {
  it("persists and restores per-staff queue orders for offline viewing", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    writeCachedQueue("staff-1", sampleOrders);
    expect(readCachedQueue("staff-1")).toEqual(sampleOrders);
    expect(readCachedQueue("staff-2")).toBeNull();
  });
});
