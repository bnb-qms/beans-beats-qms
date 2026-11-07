import Dexie, { type Table } from "dexie";
import {
  validateDraft,
  type Draft,
  type Menu,
  type Receipt,
} from "@/lib/order";
import type { PendingStatusUpdate, QueueOrder } from "@/lib/queue";
import type { Staff } from "@/lib/staff-server";

export type PendingOrder = {
  requestId: string;
  staffId: string;
  attempt: { draft: Draft; totalCents: number };
  error?: string;
  needsReview?: boolean;
};

export type SyncedOrder = {
  requestId: string;
  staffId: string;
  receipt: Receipt;
};

type Snapshot = {
  staffId: string;
  staff: Staff;
  verifiedUntil: number;
  verifiedAt?: number;
  orders: QueueOrder[];
  pending: PendingStatusUpdate[];
  menu: Menu | null;
};

class OfflineStore extends Dexie {
  snapshots!: Table<Snapshot, string>;
  pendingOrders!: Table<PendingOrder, string>;
  syncedOrders!: Table<SyncedOrder, string>;

  constructor() {
    super("beans-beats-offline");
    this.version(1).stores({
      snapshots: "staffId",
      pendingOrders: "requestId, staffId",
    });
    this.version(2).stores({
      snapshots: "staffId",
      pendingOrders: "requestId, staffId",
      syncedOrders: "requestId, staffId",
    });
  }
}

export const offlineStore = new OfflineStore();

export async function updateSnapshot(
  staff: Staff,
  patch: Partial<Pick<Snapshot, "orders" | "pending" | "menu">>,
) {
  await offlineStore.transaction("rw", offlineStore.snapshots, async () => {
    const previous = await offlineStore.snapshots.get(staff.id);
    await offlineStore.snapshots.put({
      staffId: staff.id,
      staff,
      verifiedUntil: previous?.verifiedUntil ?? 0,
      verifiedAt: previous?.verifiedAt,
      orders: previous?.orders ?? [],
      pending: previous?.pending ?? [],
      menu: previous?.menu ?? null,
      ...patch,
    });
  });
}

export async function rememberStaff(staff: Staff) {
  await offlineStore.snapshots
    .where("staffId")
    .notEqual(staff.id)
    .modify({ verifiedUntil: 0 });
  await updateSnapshot(staff, {});
  await offlineStore.snapshots.update(staff.id, {
    verifiedUntil: Date.now() + 12 * 60 * 60 * 1000,
    verifiedAt: Date.now(),
  });
}

export async function cachedStaff(): Promise<Staff | null> {
  const snapshots = await offlineStore.snapshots.toArray();
  const current = snapshots
    .filter((s) => s.verifiedUntil > Date.now())
    .sort((a, b) => (b.verifiedAt ?? 0) - (a.verifiedAt ?? 0))[0];
  return current?.staff ?? null;
}

export async function lockOfflineStaff() {
  await offlineStore.snapshots.toCollection().modify({ verifiedUntil: 0 });
}

export async function saveOfflineOrder(order: PendingOrder) {
  if (
    order.requestId !== order.attempt.draft.requestId ||
    !validateDraft(order.attempt.draft) ||
    !Number.isSafeInteger(order.attempt.totalCents) ||
    order.attempt.totalCents < 0
  )
    throw new Error("Check the order before saving it offline.");
  await offlineStore.pendingOrders.put(order);
}

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Receipt;
  return (
    typeof receipt.id === "string" &&
    Number.isSafeInteger(receipt.order_number) &&
    receipt.order_number > 0 &&
    typeof receipt.customer_first_name === "string" &&
    receipt.customer_first_name.length > 0 &&
    typeof receipt.event_day === "string" &&
    Array.isArray(receipt.items)
  );
}

let submitting = false;

export async function syncPendingOrders(staff: Staff): Promise<PendingOrder[]> {
  if (submitting || !navigator.onLine) return [];
  submitting = true;
  try {
    const pending = await offlineStore.pendingOrders
      .where("staffId")
      .equals(staff.id)
      .toArray();
    for (const order of pending) {
      if (order.needsReview) continue;
      try {
        const response = await fetch("/api/counter/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order.attempt),
        });
        if (response.ok) {
          const receipt: unknown = await response.json();
          if (!isReceipt(receipt)) throw new Error("Invalid order receipt");
          await offlineStore.transaction(
            "rw",
            offlineStore.pendingOrders,
            offlineStore.syncedOrders,
            async () => {
              await offlineStore.syncedOrders.put({
                requestId: order.requestId,
                staffId: staff.id,
                receipt,
              });
              await offlineStore.pendingOrders.delete(order.requestId);
            },
          );
        } else {
          const body = await response.json().catch(() => ({}));
          await offlineStore.pendingOrders.update(order.requestId, {
            error: body.error ?? "Submission failed; retrying when connected.",
            needsReview:
              response.status === 400 ||
              response.status === 403 ||
              response.status === 409,
          });
          if (response.status === 401 || response.status === 403) {
            await lockOfflineStaff();
            window.dispatchEvent(new Event("staff-session-ended"));
            break;
          }
        }
      } catch {
        break;
      }
    }
    window.dispatchEvent(new Event("offline-orders-changed"));
    return offlineStore.pendingOrders
      .where("staffId")
      .equals(staff.id)
      .toArray();
  } finally {
    submitting = false;
  }
}
