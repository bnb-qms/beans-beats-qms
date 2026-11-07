// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/offline-store";
import { BaristaQueue, pendingUpdatesStorageKey } from "./barista-queue";
import type { QueueOrder } from "@/lib/queue";

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
