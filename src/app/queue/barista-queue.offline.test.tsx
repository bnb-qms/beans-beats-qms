// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/offline-store";
import { BaristaQueue, pendingUpdatesStorageKey } from "./barista-queue";
import type { PendingStatusUpdate, QueueOrder } from "@/lib/queue";

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
const order: QueueOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 14,
  event_day: "2026-11-07",
  customer_first_name: "Mei",
  status: "queued",
  created_at: "2026-11-07T02:00:00.000Z",
  version: 1,
  items: [],
};
const secondOrder: QueueOrder = {
  ...order,
  id: "00000000-0000-4000-8000-000000000002",
  order_number: 15,
  customer_first_name: "Ravi",
};
// Server queue payloads must be valid parsed orders, so they need items.
const item = {
  id: "00000000-0000-4000-8000-000000000021",
  menu_item_name: "latte",
  quantity: 1,
  add_ons: [] as string[],
};
const pendingFourteen: PendingStatusUpdate = {
  orderId: order.id,
  orderNumber: 14,
  customerFirstName: "Mei",
  fromStatus: "queued",
  status: "preparing",
  expectedVersion: 1,
};
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await store.updateSnapshot(staff, { orders: [order], pending: [] });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  await store.offlineStore.snapshots.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountQueue() {
  await act(async () => root.render(<BaristaQueue staff={staff} />));
  await vi.waitFor(() =>
    expect(host.querySelector("button")?.disabled).toBe(false),
  );
}

it("restores a pending update after a delayed write and reload", async () => {
  await mountQueue();
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const write = store.updateSnapshot;
  vi.spyOn(store, "updateSnapshot").mockImplementation(async (...args) => {
    await blocked;
    return write(...args);
  });
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Updating…");
  expect(host.textContent).not.toContain("Pending sync");
  expect((await store.offlineStore.snapshots.get(staff.id))?.pending).toEqual(
    [],
  );
  await act(async () => {
    finish();
  });
  await vi.waitFor(() => expect(host.textContent).toContain("Pending sync"));
  await act(async () => root.unmount());
  root = createRoot(host);
  await mountQueue();
  expect(host.textContent).toContain("Preparing · Pending sync");
});

it("keeps the original status when IndexedDB cannot save an offline tap", async () => {
  await mountQueue();
  vi.spyOn(store, "updateSnapshot").mockRejectedValue(new Error("disk full"));
  await act(async () => host.querySelector("button")!.click());
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Could not save pending updates"),
  );
  expect(host.textContent).toContain("Queued");
  expect(host.textContent).not.toContain("Pending sync");
  expect((await store.offlineStore.snapshots.get(staff.id))?.pending).toEqual(
    [],
  );
});

it("keeps both quick offline updates when the first save is delayed", async () => {
  await store.updateSnapshot(staff, { orders: [order, secondOrder] });
  await mountQueue();
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const write = store.updateSnapshot;
  vi.spyOn(store, "updateSnapshot").mockImplementation(async (...args) => {
    await blocked;
    return write(...args);
  });
  const buttons = [...host.querySelectorAll("button")].filter(
    (button) => button.textContent === "Mark preparing",
  );
  await act(async () => {
    buttons[0].click();
    buttons[1].click();
  });
  await act(async () => finish());
  await vi.waitFor(async () =>
    expect(
      (await store.offlineStore.snapshots.get(staff.id))?.pending
        .map((update) => update.orderNumber)
        .sort(),
    ).toEqual([14, 15]),
  );
});

it("keeps the queue usable with legacy updates when migration fails", async () => {
  sessionStorage.setItem(
    pendingUpdatesStorageKey(staff.id),
    JSON.stringify([
      {
        orderId: secondOrder.id,
        orderNumber: secondOrder.order_number,
        customerFirstName: secondOrder.customer_first_name,
        fromStatus: "queued",
        status: "preparing",
        expectedVersion: secondOrder.version,
      },
    ]),
  );
  vi.spyOn(store, "updateSnapshot").mockRejectedValue(new Error("disk full"));
  await act(async () => root.render(<BaristaQueue staff={staff} />));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Offline storage is unavailable"),
  );
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(
    sessionStorage.getItem(pendingUpdatesStorageKey(staff.id)),
  ).not.toBeNull();
});

it("migrates a newer session update over an older snapshot", async () => {
  sessionStorage.setItem(
    pendingUpdatesStorageKey(staff.id),
    JSON.stringify([
      {
        orderId: order.id,
        orderNumber: order.order_number,
        customerFirstName: order.customer_first_name,
        fromStatus: "queued",
        status: "preparing",
        expectedVersion: order.version,
      },
    ]),
  );
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const write = store.updateSnapshot;
  const save = vi
    .spyOn(store, "updateSnapshot")
    .mockImplementation(async (...args) => {
      await blocked;
      return write(...args);
    });
  await act(async () => root.render(<BaristaQueue staff={staff} />));
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<BaristaQueue staff={staff} />));
  expect(
    sessionStorage.getItem(pendingUpdatesStorageKey(staff.id)),
  ).not.toBeNull();
  expect(host.querySelector("button")?.disabled).toBe(true);
  await act(async () => finish());
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Preparing · Pending sync"),
  );
  expect(sessionStorage.getItem(pendingUpdatesStorageKey(staff.id))).toBeNull();
  expect(
    (await store.offlineStore.snapshots.get(staff.id))?.pending,
  ).toHaveLength(1);
});

function goOnline(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  return fetchMock;
}

it("sends one request per offline update when the connection returns, then refreshes", async () => {
  await store.updateSnapshot(staff, { orders: [order, secondOrder] });
  await mountQueue();
  const buttons = [...host.querySelectorAll("button")].filter(
    (button) => button.textContent === "Mark preparing",
  );
  expect(buttons).toHaveLength(2);
  await act(async () => {
    buttons[0].click();
    buttons[1].click();
  });
  await vi.waitFor(async () =>
    expect(
      (await store.offlineStore.snapshots.get(staff.id))?.pending,
    ).toHaveLength(2),
  );
  // Simulate a tab reload while still offline, then the connection returns.
  await act(async () => root.unmount());
  root = createRoot(host);
  await mountQueue();
  const prepared: QueueOrder[] = [
    { ...order, status: "preparing", version: 2, items: [item] },
    { ...secondOrder, status: "preparing", version: 2, items: [item] },
  ];
  const syncFetch = goOnline(async (_url, init) => {
    if (init?.method === "PATCH")
      return new Response(
        JSON.stringify({
          id: order.id,
          order_number: 14,
          event_day: "2026-11-07",
          status: "preparing",
          version: 2,
        }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ orders: prepared }), { status: 200 });
  });
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await vi.waitFor(() => {
    const patchCalls = syncFetch.mock.calls.filter(
      ([, init]) => init?.method === "PATCH",
    );
    expect(
      patchCalls.map(([, init]) => JSON.parse(init!.body as string)),
    ).toEqual([
      { orderId: order.id, expectedVersion: 1, status: "preparing" },
      { orderId: secondOrder.id, expectedVersion: 1, status: "preparing" },
    ]);
  });
  await vi.waitFor(async () =>
    expect((await store.offlineStore.snapshots.get(staff.id))?.pending).toEqual(
      [],
    ),
  );
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Preparing");
    expect(host.textContent).not.toContain("Pending sync");
  });
  expect(host.textContent).toContain("Connected · queue updates automatically");
});

it("flags a conflicted offline update for review on reconnect and clears it on dismiss", async () => {
  await store.updateSnapshot(staff, {
    orders: [order],
    pending: [pendingFourteen],
  });
  await mountQueue();
  const syncFetch = goOnline(async (_url, init) => {
    if (init?.method === "PATCH")
      return new Response(
        JSON.stringify({
          error:
            "This offline status update conflicted with a change made by another barista. Review the current queue status.",
        }),
        { status: 409 },
      );
    // Server state already moved on; the order stays queued at version 2.
    return new Response(
      JSON.stringify({ orders: [{ ...order, version: 2, items: [item] }] }),
      { status: 200 },
    );
  });
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Conflict on order #14 (Mei)"),
  );
  expect(host.textContent).toContain("Dismiss conflict");
  expect(host.textContent).toContain("Queued");
  expect(host.textContent).not.toContain("Pending sync");
  const dismiss = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Dismiss conflict",
  );
  await act(async () => dismiss!.click());
  await vi.waitFor(async () =>
    expect((await store.offlineStore.snapshots.get(staff.id))?.pending).toEqual(
      [],
    ),
  );
  await vi.waitFor(() =>
    expect(host.textContent).not.toContain("Conflict on order #14"),
  );
  expect(
    syncFetch.mock.calls.filter(([, init]) => init?.method === "PATCH"),
  ).toHaveLength(1);
});

it("keeps pending updates when local storage fails during sync", async () => {
  await store.updateSnapshot(staff, {
    orders: [order],
    pending: [pendingFourteen],
  });
  await mountQueue();
  vi.spyOn(store, "updateSnapshot").mockRejectedValue(new Error("disk full"));
  const syncFetch = goOnline(async (_url, init) =>
    init?.method === "PATCH"
      ? new Response(
          JSON.stringify({
            id: order.id,
            order_number: 14,
            event_day: "2026-11-07",
            status: "preparing",
            version: 2,
          }),
          { status: 200 },
        )
      : Promise.reject(new TypeError("offline")),
  );
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Could not save pending updates on this device.",
    ),
  );
  expect(
    (await store.offlineStore.snapshots.get(staff.id))?.pending,
  ).toHaveLength(1);
  expect(
    syncFetch.mock.calls.filter(([, init]) => init?.method === "PATCH"),
  ).toHaveLength(1);
});
