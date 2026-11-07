export const TRACKING_TOKEN = /^[0-9a-f]{64}$/;

export const guestStatuses = {
  queued: { label: "Received", explanation: "Your order is in the queue." },
  preparing: {
    label: "Making",
    explanation: "Your drinks are being prepared.",
  },
  ready: {
    label: "Ready",
    explanation: "Please collect your order at the booth.",
  },
  collected: {
    label: "Collected",
    explanation: "Your pickup is complete. Thank you!",
  },
  cancelled: {
    label: "Cancelled",
    explanation: "Please check with counter staff about your order.",
  },
};

export type GuestOrder = {
  order_number: number;
  event_day: string;
  status: keyof typeof guestStatuses;
};

export function isGuestOrder(value: unknown): value is GuestOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as GuestOrder;
  return (
    Number.isSafeInteger(order.order_number) &&
    order.order_number > 0 &&
    typeof order.event_day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(order.event_day) &&
    Object.hasOwn(guestStatuses, order.status)
  );
}
