import { describe, expect, it } from "vitest";
import {
  applyPendingUpdates,
  formatQueueItemDetails,
  isPendingStatusUpdate,
  isQueueOrder,
  isValidStatusTransition,
  nextOrderStatus,
  parseQueueOrders,
  queueStatusLabel,
  sortQueueOrders,
  statusActionLabel,
  validStatusUpdate,
  type PendingStatusUpdate,
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
  it("formats status labels for each stage", () => {
    expect(queueStatusLabel("queued")).toBe("Queued");
    expect(queueStatusLabel("preparing")).toBe("Preparing");
    expect(queueStatusLabel("ready")).toBe("Ready");
    expect(queueStatusLabel("collected")).toBe("Collected");
  });

  it("enforces single-step forward transitions and action labels", () => {
    expect(nextOrderStatus("queued")).toBe("preparing");
    expect(nextOrderStatus("preparing")).toBe("ready");
    expect(nextOrderStatus("ready")).toBe("collected");
    expect(nextOrderStatus("collected")).toBeNull();

    expect(statusActionLabel("queued")).toBe("Mark preparing");
    expect(statusActionLabel("preparing")).toBe("Mark ready");
    expect(statusActionLabel("ready")).toBe("Mark collected");
    expect(statusActionLabel("collected")).toBeNull();

    expect(isValidStatusTransition("queued", "preparing")).toBe(true);
    expect(isValidStatusTransition("preparing", "ready")).toBe(true);
    expect(isValidStatusTransition("ready", "collected")).toBe(true);
    expect(isValidStatusTransition("queued", "ready")).toBe(false);
    expect(isValidStatusTransition("queued", "collected")).toBe(false);
    expect(isValidStatusTransition("preparing", "queued")).toBe(false);
    expect(isValidStatusTransition("ready", "preparing")).toBe(false);
  });

  it("validates status update requests and pending offline updates", () => {
    expect(
      validStatusUpdate({
        orderId: baseOrder.id,
        expectedVersion: 1,
        status: "preparing",
      }),
    ).toBe(true);
    expect(
      validStatusUpdate({
        orderId: baseOrder.id,
        expectedVersion: 0,
        status: "preparing",
      }),
    ).toBe(false);
    expect(
      validStatusUpdate({
        orderId: baseOrder.id,
        expectedVersion: 1,
        status: "queued",
      }),
    ).toBe(false);

    const pending: PendingStatusUpdate = {
      orderId: baseOrder.id,
      orderNumber: 14,
      customerFirstName: "Mei",
      fromStatus: "queued",
      status: "preparing",
      expectedVersion: 1,
    };
    expect(isPendingStatusUpdate(pending)).toBe(true);
    expect(isPendingStatusUpdate({ ...pending, status: "ready" })).toBe(false);
  });

  it("projects pending offline updates onto loaded queue orders and removes collected orders", () => {
    const secondOrder: QueueOrder = {
      ...baseOrder,
      id: "00000000-0000-4000-8000-000000000002",
      order_number: 15,
      customer_first_name: "Arjun",
      status: "preparing",
      created_at: "2026-11-26T02:02:00.000Z",
      version: 2,
    };
    const thirdOrder: QueueOrder = {
      ...baseOrder,
      id: "00000000-0000-4000-8000-000000000003",
      order_number: 16,
      customer_first_name: "Siti",
      status: "ready",
      created_at: "2026-11-26T02:04:00.000Z",
      version: 3,
    };
    const projected = applyPendingUpdates(
      [baseOrder, secondOrder, thirdOrder],
      [
        {
          orderId: baseOrder.id,
          orderNumber: 14,
          customerFirstName: "Mei",
          fromStatus: "queued",
          status: "preparing",
          expectedVersion: 1,
        },
        {
          orderId: secondOrder.id,
          orderNumber: 15,
          customerFirstName: "Arjun",
          fromStatus: "preparing",
          status: "ready",
          expectedVersion: 2,
        },
        {
          orderId: thirdOrder.id,
          orderNumber: 16,
          customerFirstName: "Siti",
          fromStatus: "ready",
          status: "collected",
          expectedVersion: 3,
        },
      ],
    );
    expect(projected).toHaveLength(2);
    expect(projected[0].id).toBe(baseOrder.id);
    expect(projected[0].status).toBe("preparing");
    expect(projected[0].version).toBe(2);
    expect(projected[1].id).toBe(secondOrder.id);
    expect(projected[1].status).toBe("ready");
    expect(projected[1].version).toBe(3);
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
    expect(isQueueOrder({ ...baseOrder, status: "ready" })).toBe(true);
    expect(parseQueueOrders([baseOrder])).toEqual([baseOrder]);
    expect(isQueueOrder({ ...baseOrder, status: "collected" })).toBe(false);
    expect(isQueueOrder({ ...baseOrder, status: "cancelled" })).toBe(false);
    expect(isQueueOrder({ ...baseOrder, items: [] })).toBe(false);
    expect(parseQueueOrders("not-an-array")).toBeNull();
  });
});
