// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { offlineStore } from "@/lib/offline-store";
import { OrderEntry } from "./order-entry";

vi.mock("@/components/use-menu", () => ({
  useMenu: () => ({
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
    connected: false,
    error: "",
    refresh: vi.fn(),
  }),
}));

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
      tracking_url: null,
      tracking_qr: null,
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
