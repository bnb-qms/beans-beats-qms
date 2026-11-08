// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/offline-store";
import {
  BaristaQueue,
  BaristaQueueView,
  readCachedQueue,
  readPendingUpdates,
  writeCachedQueue,
} from "./barista-queue";
import type { PendingStatusUpdate, QueueOrder } from "@/lib/queue";

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
  it("renders order details, statuses, and one-tap action buttons in sequence", () => {
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
    expect(html).toContain("Mark preparing");
    expect(html).toContain("2×");
    expect(html).toContain("Latte · Iced · Oat");
    expect(html).toContain("1×");
    expect(html).toContain("Espresso · Hot");

    expect(html).toContain("15");
    expect(html).toContain("Arjun");
    expect(html).toContain("Preparing");
    expect(html).toContain("Mark ready");
    expect(html).toContain("Flat white · Hot");

    expect(html).toContain("16");
    expect(html).toContain("Siti");
    expect(html).toContain("Ready");
    expect(html).toContain("Mark collected");
    expect(html).toContain("border-signal");
    expect(html).toContain("Americano · Iced");

    expect(html.indexOf("Mei")).toBeLessThan(html.indexOf("Arjun"));
    expect(html.indexOf("Arjun")).toBeLessThan(html.indexOf("Siti"));
  });

  it("disables the action button and shows Updating… while an update is processing", () => {
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: [sampleOrders[0]],
        updatingIds: [sampleOrders[0].id],
        connected: true,
        error: "",
        onRetry() {},
      }),
    );
    expect(html).toContain("Updating…");
    expect(html).toContain("disabled");
  });

  it("displays offline updates as Pending sync, keeps Ready orders visible, and removes Collected orders from the active queue", () => {
    const pending: PendingStatusUpdate[] = [
      {
        orderId: sampleOrders[0].id,
        orderNumber: 14,
        customerFirstName: "Mei",
        fromStatus: "queued",
        status: "preparing",
        expectedVersion: 1,
      },
      {
        orderId: sampleOrders[1].id,
        orderNumber: 15,
        customerFirstName: "Arjun",
        fromStatus: "preparing",
        status: "ready",
        expectedVersion: 2,
      },
      {
        orderId: sampleOrders[2].id,
        orderNumber: 16,
        customerFirstName: "Siti",
        fromStatus: "ready",
        status: "collected",
        expectedVersion: 3,
      },
    ];
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: sampleOrders,
        pendingUpdates: pending,
        connected: false,
        error: "",
        onRetry() {},
      }),
    );
    expect(html).toContain("Preparing · Pending sync");
    expect(html).toContain("Ready · Pending sync");
    expect(html).toContain("Mark collected");
    expect(html).toContain("Offline · 3 updates pending sync");
    expect(html).toContain("Mei");
    expect(html).toContain("Arjun");
    expect(html).not.toContain("Siti");
  });

  it("flags conflicting offline updates for staff review without overwriting the server status", () => {
    const pending: PendingStatusUpdate[] = [
      {
        orderId: sampleOrders[0].id,
        orderNumber: 14,
        customerFirstName: "Mei",
        fromStatus: "queued",
        status: "preparing",
        expectedVersion: 1,
        conflict:
          "This order was updated by another barista. Review the latest status before trying again.",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: [sampleOrders[0]],
        pendingUpdates: pending,
        connected: true,
        error: "",
        onRetry() {},
        onDismissConflict() {},
      }),
    );
    expect(html).toContain("Conflict on order #14 (Mei)");
    expect(html).toContain("Dismiss conflict");
    expect(html).toContain("Queued");
    expect(html).not.toContain("Pending sync");
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

  it("shows an unavailable state with a retry action when the queue failed to load", () => {
    const html = renderToStaticMarkup(
      createElement(BaristaQueueView, {
        orders: null,
        connected: false,
        error: "Cannot load the order queue. Check your connection and retry.",
        onRetry() {},
      }),
    );
    expect(html).toContain("Queue is unavailable.");
    expect(html).toContain("Retry queue");
    expect(html).toContain("Cannot load the order queue.");
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

describe("sessionStorage offline cache and legacy pending updates", () => {
  it("restores per-staff queue orders and reads pending updates from older versions", () => {
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

    const pending: PendingStatusUpdate[] = [
      {
        orderId: sampleOrders[0].id,
        orderNumber: 14,
        customerFirstName: "Mei",
        fromStatus: "queued",
        status: "preparing",
        expectedVersion: 1,
      },
    ];
    sessionStorage.setItem(
      "bb-queue-pending-updates:staff-1",
      JSON.stringify(pending),
    );
    expect(readPendingUpdates("staff-1")).toEqual(pending);
    expect(readPendingUpdates("staff-2")).toEqual([]);
  });
});

describe("BaristaQueue online behaviour", () => {
  const staff = {
    id: "staff-1",
    username: "barista",
    role: "barista" as const,
  };
  let host: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  function online(
    handler: (url: string, init?: RequestInit) => Promise<Response>,
  ) {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    fetchMock = vi.fn(handler);
    vi.stubGlobal("fetch", fetchMock);
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    sessionStorage.clear();
    await store.offlineStore.snapshots.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a server error with retry, then loads the queue when refreshed", async () => {
    let attempts = 0;
    online(async () => {
      attempts += 1;
      if (attempts === 1)
        return new Response(
          JSON.stringify({
            error:
              "Cannot load the order queue. Check your connection and retry.",
          }),
          { status: 503 },
        );
      return new Response(JSON.stringify({ orders: [sampleOrders[0]] }), {
        status: 200,
      });
    });
    await act(async () => root.render(<BaristaQueue staff={staff} />));
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Queue is unavailable."),
    );
    expect(host.textContent).toContain(
      "Cannot load the order queue. Check your connection and retry.",
    );
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Retry queue",
    );
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Mark preparing"),
    );
    expect(host.textContent).toContain("Mei");
    expect(host.textContent).toContain("Latte · Iced · Oat");
  });

  it("advances a ready order online, removes it from the queue, and updates the offline cache", async () => {
    let collected = false;
    online(async (_url, init) => {
      if (init?.method === "PATCH") {
        collected = true;
        return new Response(
          JSON.stringify({
            id: sampleOrders[2].id,
            order_number: 16,
            event_day: "2026-11-26",
            status: "collected",
            version: 4,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ orders: collected ? [] : [sampleOrders[2]] }),
        { status: 200 },
      );
    });
    await act(async () => root.render(<BaristaQueue staff={staff} />));
    await vi.waitFor(() =>
      expect(host.querySelector("button")?.disabled).toBe(false),
    );
    const advance = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Mark collected",
    );
    expect(advance).toBeDefined();
    await act(async () => advance!.click());
    await vi.waitFor(() => expect(host.textContent).not.toContain("Siti"));
    expect(host.textContent).toContain("No pending orders in the queue.");
    const patchCalls = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(patchCalls[0][1].body as string)).toEqual({
      orderId: sampleOrders[2].id,
      expectedVersion: 3,
      status: "collected",
    });
    expect(
      JSON.parse(sessionStorage.getItem("bb-queue-orders:staff-1")!),
    ).toEqual([]);
  });
});
