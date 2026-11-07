import { describe, expect, it } from "vitest";
import {
  formatQueueItemDetails,
  isQueueOrder,
  parseQueueOrders,
  queueStatusLabel,
  sortQueueOrders,
  type QueueOrder,
} from "./queue";

const baseOrder: QueueOrder = {
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
  ],
};

describe("queue helpers", () => {
  it("formats status labels as Queued and Preparing", () => {
    expect(queueStatusLabel("queued")).toBe("Queued");
    expect(queueStatusLabel("preparing")).toBe("Preparing");
  });

  it("formats drink, temperature, and milk option matching /design", () => {
    expect(
      formatQueueItemDetails({
        menu_item_name: "latte",
        add_ons: ["iced", "oat milk"],
      }),
    ).toBe("Latte · Iced · Oat");
    expect(
      formatQueueItemDetails({
        menu_item_name: "flat white",
        add_ons: [],
      }),
    ).toBe("Flat white · Hot");
    expect(
      formatQueueItemDetails({
        menu_item_name: "espresso",
        add_ons: [],
      }),
    ).toBe("Espresso · Hot");
    expect(
      formatQueueItemDetails({
        menu_item_name: "americano",
        add_ons: ["iced"],
      }),
    ).toBe("Americano · Iced");
  });

  it("sorts active orders oldest first and deduplicates by id keeping newer version", () => {
    const newer: QueueOrder = {
      ...baseOrder,
      id: "00000000-0000-4000-8000-000000000002",
      order_number: 15,
      customer_first_name: "Arjun",
      created_at: "2026-11-26T02:05:00.000Z",
    };
    const updatedBase: QueueOrder = {
      ...baseOrder,
      status: "preparing",
      version: 2,
    };
    const sorted = sortQueueOrders([newer, baseOrder, updatedBase]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].id).toBe(baseOrder.id);
    expect(sorted[0].status).toBe("preparing");
    expect(sorted[1].id).toBe(newer.id);
  });

  it("validates queue order payloads and rejects non-active statuses or invalid fields", () => {
    expect(isQueueOrder(baseOrder)).toBe(true);
    expect(parseQueueOrders([baseOrder])).toEqual([baseOrder]);
    expect(isQueueOrder({ ...baseOrder, status: "ready" })).toBe(false);
    expect(isQueueOrder({ ...baseOrder, status: "collected" })).toBe(false);
    expect(isQueueOrder({ ...baseOrder, status: "cancelled" })).toBe(false);
    expect(isQueueOrder({ ...baseOrder, items: [] })).toBe(false);
    expect(parseQueueOrders("not-an-array")).toBeNull();
  });
});
