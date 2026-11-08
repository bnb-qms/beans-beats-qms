// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { offlineStore } from "@/lib/offline-store";
import { OrderEntry } from "./order-entry";

const offlineMocks = vi.hoisted(() => ({
  connected: false,
  menu: {
    drinks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "espresso",
        base_price: 3,
        is_active: true,
        is_available: true,
        version: 1,
      },
    ],
    addOns: [],
  },
  saveOfflineOrder: vi.fn(),
  realSaveOfflineOrder: null as unknown as (order: unknown) => Promise<void>,
}));
vi.mock("@/components/use-menu", () => ({
  useMenu: () => ({
    menu: offlineMocks.menu,
    connected: offlineMocks.connected,
    error: "",
    refresh: () => Promise.resolve(offlineMocks.menu),
  }),
}));
// Intercept the offline save so one test can fail the IndexedDB write.
vi.mock("@/lib/offline-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/offline-store")>();
  offlineMocks.realSaveOfflineOrder = real.saveOfflineOrder as (
    order: unknown,
  ) => Promise<void>;
  return { ...real, saveOfflineOrder: offlineMocks.saveOfflineOrder };
});

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  offlineMocks.connected = false;
  offlineMocks.saveOfflineOrder.mockReset();
  offlineMocks.saveOfflineOrder.mockImplementation(
    offlineMocks.realSaveOfflineOrder,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  sessionStorage.setItem(
    `bb-counter-draft:${staff.id}`,
    JSON.stringify({
      draft: {
        requestId: "00000000-0000-4000-8000-000000000002",
        firstName: "Mei",
        mobile: "",
        consent: false,
        lines: [
          {
            id: "line-1",
            menu_item_id: "00000000-0000-4000-8000-000000000001",
            quantity: 1,
            add_on_ids: [],
          },
        ],
      },
      attempt: null,
      receipt: null,
    }),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  await offlineStore.pendingOrders.clear();
  await offlineStore.syncedOrders.clear();
  vi.unstubAllGlobals();
});

it("saves an offline order without a provisional pickup number, then shows a synced receipt", async () => {
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const submit = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Submit order",
  );
  expect(submit).toBeTruthy();
  await act(async () => {
    submit!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  // The IndexedDB write can take longer than 10 ms when the whole suite runs.
  await vi.waitFor(async () =>
    expect(await offlineStore.pendingOrders.count()).toBe(1),
  );
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Pending sync: Mei"),
  );
  expect(host.textContent).toContain("no pickup number yet");
  await offlineStore.syncedOrders.put({
    requestId: "00000000-0000-4000-8000-000000000002",
    staffId: staff.id,
    receipt: {
      id: "order-1",
      order_number: 12,
      customer_first_name: "Mei",
      event_day: "2026-11-07",
      total_amount: 3,
      items: [],
      tracking_url: "https://booth.test/o/track#private-token",
      tracking_qr: "data:image/png;base64,AAAA",
      tracking_warning: null,
    },
  });
  await offlineStore.pendingOrders.clear();
  await act(async () => {
    window.dispatchEvent(new Event("offline-orders-changed"));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await vi.waitFor(() => expect(host.textContent).toContain("Synced: #12 Mei"));
  expect(
    host
      .querySelector('img[alt="Tracking QR for pickup number 12"]')
      ?.getAttribute("src"),
  ).toBe("data:image/png;base64,AAAA");
  expect(
    host.querySelector('a[href="https://booth.test/o/track#private-token"]'),
  ).toBeTruthy();
});

it("shows the tracking warning when a synced receipt has no secure QR", async () => {
  await offlineStore.syncedOrders.put({
    requestId: "request-without-qr",
    staffId: staff.id,
    receipt: {
      id: "order-2",
      order_number: 13,
      customer_first_name: "Mei",
      event_day: "2026-11-07",
      total_amount: 3,
      items: [],
      tracking_url: null,
      tracking_qr: null,
      tracking_warning: "Tracking is unavailable. Ask counter staff for help.",
    },
  });
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Tracking is unavailable. Ask counter staff for help.",
    ),
  );
  expect(host.querySelector('img[alt^="Tracking QR"]')).toBeNull();
});

it("lets staff restore a rejected order for reconciliation", async () => {
  await offlineStore.pendingOrders.put({
    requestId: "request-3",
    staffId: staff.id,
    attempt: {
      draft: {
        requestId: "request-3",
        firstName: "Arjun",
        mobile: "",
        consent: false,
        lines: [],
      },
      totalCents: 800,
    },
    error: "Price changed",
    needsReview: true,
  });
  sessionStorage.removeItem(`bb-counter-draft:${staff.id}`);
  window.confirm = vi.fn().mockReturnValue(true);
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(host.textContent).toContain("Needs review: Arjun");
  const edit = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Edit after POS reconciliation",
  );
  await act(async () => edit!.click());
  expect(await offlineStore.pendingOrders.count()).toBe(0);
  expect(
    (host.querySelector('input[maxlength="20"]') as HTMLInputElement).value,
  ).toBe("Arjun");
});

// A dropped network connection mid-submission must not lose the paid
// attempt: it is stored with the same request ID for automatic retry.
it("stores a failed online submission for retry without a provisional pickup number", async () => {
  offlineMocks.connected = true;
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const submit = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Submit order",
  );
  await act(async () => {
    submit!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.waitFor(async () =>
    expect(await offlineStore.pendingOrders.count()).toBe(1),
  );
  const [pending] = await offlineStore.pendingOrders.toArray();
  expect(pending.requestId).toBe("00000000-0000-4000-8000-000000000002");
  expect(pending.attempt.draft.requestId).toBe(
    "00000000-0000-4000-8000-000000000002",
  );
  expect(pending.attempt.totalCents).toBe(300);
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Connection lost during submission"),
  );
  expect(host.textContent).toContain("no pickup number yet");
  expect(host.textContent).not.toContain("Order received");
});

it("keeps the paid attempt locked for manual retry when the storage write fails", async () => {
  offlineMocks.connected = true;
  offlineMocks.saveOfflineOrder.mockRejectedValueOnce(
    new Error("storage failed"),
  );
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const submit = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Submit order",
  );
  await act(async () => {
    submit!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(await offlineStore.pendingOrders.count()).toBe(0);
  // The locked attempt survives in the draft for a manual retry.
  const savedDraft = JSON.parse(
    sessionStorage.getItem(`bb-counter-draft:${staff.id}`)!,
  );
  expect(savedDraft.attempt.draft.requestId).toBe(
    "00000000-0000-4000-8000-000000000002",
  );
  expect(savedDraft.attempt.totalCents).toBe(300);
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Submission not yet confirmed"),
  );
  expect(host.textContent).not.toContain("Pending sync");
  expect(host.textContent).not.toContain("Order received");
  const add = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Add espresso",
  );
  expect(add!.disabled).toBe(true);
  // Retrying re-sends the same paid attempt with the same request ID.
  const retry = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Retry submission",
  );
  await act(async () => {
    retry!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(fetchMock.mock.calls[1][1].body as string).draft.requestId,
  ).toBe("00000000-0000-4000-8000-000000000002");
});
