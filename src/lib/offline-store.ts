import Dexie, { type Table } from "dexie";
import type { Menu } from "@/lib/order";
import type { PendingStatusUpdate, QueueOrder } from "@/lib/queue";
import type { Staff } from "@/lib/staff-server";

export type PendingOrder = {
  requestId: string;
  staffId: string;
  attempt: { draft: import("@/lib/order").Draft; totalCents: number };
  error?: string;
};

type Snapshot = {
  staffId: string;
  staff: Staff;
  verifiedUntil: number;
  orders: QueueOrder[];
  pending: PendingStatusUpdate[];
  menu: Menu | null;
};

class OfflineStore extends Dexie {
  snapshots!: Table<Snapshot, string>;
  pendingOrders!: Table<PendingOrder, string>;

  constructor() {
    super("beans-beats-offline");
    this.version(1).stores({
      snapshots: "staffId",
      pendingOrders: "requestId, staffId",
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
      orders: previous?.orders ?? [],
      pending: previous?.pending ?? [],
      menu: previous?.menu ?? null,
      ...patch,
    });
  });
}

export async function rememberStaff(staff: Staff) {
  await updateSnapshot(staff, {});
  await offlineStore.snapshots.update(staff.id, {
    verifiedUntil: Date.now() + 12 * 60 * 60 * 1000,
  });
}

export async function cachedStaff(): Promise<Staff | null> {
  const snapshots = await offlineStore.snapshots.toArray();
  const current = snapshots.find((s) => s.verifiedUntil > Date.now());
  return current?.staff ?? null;
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
      try {
        const response = await fetch("/api/counter/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order.attempt),
        });
        if (response.ok)
          await offlineStore.pendingOrders.delete(order.requestId);
        else {
          const body = await response.json().catch(() => ({}));
          await offlineStore.pendingOrders.update(order.requestId, {
            error: body.error ?? "Submission failed; retrying when connected.",
          });
          if (response.status === 401) {
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
