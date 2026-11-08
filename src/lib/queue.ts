import { UUID } from "./order";

export const queueStatuses = {
  queued: "Queued",
  preparing: "Preparing",
  ready: "Ready",
} as const;

export type QueueStatus = keyof typeof queueStatuses;

export type OrderLifecycleStatus =
  "queued" | "preparing" | "ready" | "collected";

export type TargetOrderStatus = "preparing" | "ready" | "collected";

const nextStatusMap: Record<OrderLifecycleStatus, TargetOrderStatus | null> = {
  queued: "preparing",
  preparing: "ready",
  ready: "collected",
  collected: null,
};

const actionLabelMap: Record<OrderLifecycleStatus, string | null> = {
  queued: "Mark preparing",
  preparing: "Mark ready",
  ready: "Mark collected",
  collected: null,
};

export type QueueItem = {
  id: string;
  menu_item_name: string;
  quantity: number;
  add_ons: string[];
};

export type QueueOrder = {
  id: string;
  order_number: number;
  event_day: string;
  customer_first_name: string;
  status: QueueStatus;
  created_at: string;
  version: number;
  items: QueueItem[];
};

export type StatusUpdateInput = {
  orderId: string;
  expectedVersion: number;
  status: TargetOrderStatus;
};

export type PendingStatusUpdate = {
  orderId: string;
  orderNumber: number;
  customerFirstName: string;
  fromStatus: OrderLifecycleStatus;
  status: TargetOrderStatus;
  expectedVersion: number;
  conflict?: string;
};

export function queueStatusLabel(status: OrderLifecycleStatus): string {
  if (status === "collected") return "Collected";
  return queueStatuses[status];
}

export function nextOrderStatus(
  status: OrderLifecycleStatus,
): TargetOrderStatus | null {
  return nextStatusMap[status] ?? null;
}

export function statusActionLabel(status: OrderLifecycleStatus): string | null {
  return actionLabelMap[status] ?? null;
}

export function isValidStatusTransition(
  from: OrderLifecycleStatus,
  to: string,
): to is TargetOrderStatus {
  return nextOrderStatus(from) === to;
}

export function validStatusUpdate(value: unknown): value is StatusUpdateInput {
  if (!value || typeof value !== "object") return false;
  const input = value as StatusUpdateInput;
  return (
    typeof input.orderId === "string" &&
    UUID.test(input.orderId) &&
    Number.isSafeInteger(input.expectedVersion) &&
    input.expectedVersion > 0 &&
    (input.status === "preparing" ||
      input.status === "ready" ||
      input.status === "collected")
  );
}

export function isPendingStatusUpdate(
  value: unknown,
): value is PendingStatusUpdate {
  if (!value || typeof value !== "object") return false;
  const item = value as PendingStatusUpdate;
  return (
    typeof item.orderId === "string" &&
    UUID.test(item.orderId) &&
    Number.isSafeInteger(item.orderNumber) &&
    item.orderNumber > 0 &&
    typeof item.customerFirstName === "string" &&
    (item.fromStatus === "queued" ||
      item.fromStatus === "preparing" ||
      item.fromStatus === "ready") &&
    isValidStatusTransition(item.fromStatus, item.status) &&
    Number.isSafeInteger(item.expectedVersion) &&
    item.expectedVersion > 0 &&
    (item.conflict === undefined || typeof item.conflict === "string")
  );
}

export function applyPendingUpdates(
  orders: readonly QueueOrder[],
  pending: readonly PendingStatusUpdate[],
): QueueOrder[] {
  const pendingByOrder = new Map<string, PendingStatusUpdate>();
  for (const update of pending) {
    if (!update.conflict) {
      pendingByOrder.set(update.orderId, update);
    }
  }
  const projected: QueueOrder[] = [];
  for (const order of orders) {
    const update = pendingByOrder.get(order.id);
    if (!update) {
      projected.push(order);
      continue;
    }
    if (update.status === "preparing" || update.status === "ready") {
      projected.push({
        ...order,
        status: update.status,
        version: update.expectedVersion + 1,
      });
    }
    // Orders locally advanced to 'collected' leave the active queue
    // while their pending update remains stored until synchronized.
  }
  return sortQueueOrders(projected);
}

export function formatDrinkName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatQueueItemDetails(
  item: Pick<QueueItem, "menu_item_name" | "add_ons">,
): string {
  const normalized = item.add_ons.map((a) => a.trim().toLowerCase());
  const temperature = normalized.includes("iced") ? "Iced" : "Hot";
  const parts = [formatDrinkName(item.menu_item_name), temperature];
  if (normalized.includes("oat milk")) parts.push("Oat");
  for (const raw of item.add_ons) {
    const lower = raw.trim().toLowerCase();
    if (lower && lower !== "iced" && lower !== "oat milk") {
      parts.push(formatDrinkName(raw));
    }
  }
  return parts.join(" · ");
}

export function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as QueueItem;
  return (
    typeof item.id === "string" &&
    UUID.test(item.id) &&
    typeof item.menu_item_name === "string" &&
    item.menu_item_name.trim().length > 0 &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity > 0 &&
    Array.isArray(item.add_ons) &&
    item.add_ons.every((a) => typeof a === "string" && a.trim().length > 0)
  );
}

export function isQueueOrder(value: unknown): value is QueueOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as QueueOrder;
  return (
    typeof order.id === "string" &&
    UUID.test(order.id) &&
    Number.isSafeInteger(order.order_number) &&
    order.order_number > 0 &&
    typeof order.event_day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(order.event_day) &&
    typeof order.customer_first_name === "string" &&
    Object.hasOwn(queueStatuses, order.status) &&
    typeof order.created_at === "string" &&
    !Number.isNaN(Date.parse(order.created_at)) &&
    Number.isSafeInteger(order.version) &&
    order.version > 0 &&
    Array.isArray(order.items) &&
    order.items.length > 0 &&
    order.items.every(isQueueItem)
  );
}

export function sortQueueOrders(orders: readonly QueueOrder[]): QueueOrder[] {
  const byId = new Map<string, QueueOrder>();
  for (const order of orders) {
    if (!Object.hasOwn(queueStatuses, order.status)) continue;
    const existing = byId.get(order.id);
    if (!existing || order.version >= existing.version) {
      byId.set(order.id, order);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const timeDiff = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (timeDiff !== 0) return timeDiff;
    if (a.order_number !== b.order_number)
      return a.order_number - b.order_number;
    return a.id.localeCompare(b.id);
  });
}

export function parseQueueOrders(value: unknown): QueueOrder[] | null {
  if (!Array.isArray(value) || !value.every(isQueueOrder)) return null;
  return sortQueueOrders(value);
}
