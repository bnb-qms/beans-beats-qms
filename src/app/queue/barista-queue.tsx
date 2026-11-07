"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { requestJson } from "@/components/staff-workspace";
import {
  applyPendingUpdates,
  formatQueueItemDetails,
  isPendingStatusUpdate,
  nextOrderStatus,
  parseQueueOrders,
  queueStatusLabel,
  statusActionLabel,
  type PendingStatusUpdate,
  type QueueOrder,
} from "@/lib/queue";
import type { Staff } from "@/lib/staff-server";
import { offlineStore, updateSnapshot } from "@/lib/offline-store";

const POLL_MS = 3000;

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function queueStorageKey(staffId: string): string {
  return `bb-queue-orders:${staffId}`;
}

export function pendingUpdatesStorageKey(staffId: string): string {
  return `bb-queue-pending-updates:${staffId}`;
}

export function readCachedQueue(staffId: string): QueueOrder[] | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(queueStorageKey(staffId));
    if (!raw) return null;
    return parseQueueOrders(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCachedQueue(staffId: string, orders: QueueOrder[]): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(queueStorageKey(staffId), JSON.stringify(orders));
  } catch {
    // Ignore storage quota errors; in-memory state still holds loaded orders.
  }
}

export function readPendingUpdates(staffId: string): PendingStatusUpdate[] {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(pendingUpdatesStorageKey(staffId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isPendingStatusUpdate))
      return [];
    return parsed;
  } catch {
    return [];
  }
}

export function BaristaQueueView({
  orders,
  pendingUpdates = [],
  updatingIds = [],
  pendingReady = true,
  connected,
  error,
  onRetry,
  onAdvance,
  onDismissConflict,
}: {
  orders: QueueOrder[] | null;
  pendingUpdates?: readonly PendingStatusUpdate[];
  updatingIds?: readonly string[];
  pendingReady?: boolean;
  connected: boolean;
  error: string;
  onRetry: () => void;
  onAdvance?: (order: QueueOrder) => void;
  onDismissConflict?: (orderId: string) => void;
}) {
  const projectedOrders = orders
    ? applyPendingUpdates(orders, pendingUpdates)
    : null;
  const pendingByOrder = new Map(
    pendingUpdates.map((u) => [u.orderId, u] as const),
  );
  const conflicts = pendingUpdates.filter((u) => Boolean(u.conflict));
  const unsyncedCount = pendingUpdates.filter((u) => !u.conflict).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <p className="eyebrow">Queue / 02</p>
          <h1 className="headline mt-2">Barista queue</h1>
        </div>
        <p className="text-muted" role="status">
          {connected
            ? unsyncedCount > 0
              ? `Connected · syncing ${unsyncedCount} offline update${unsyncedCount === 1 ? "" : "s"}…`
              : "Connected · queue updates automatically"
            : unsyncedCount > 0
              ? `Offline · ${unsyncedCount} update${unsyncedCount === 1 ? "" : "s"} pending sync`
              : "Offline · showing last loaded orders"}
        </p>
      </div>
      {error && (
        <p role="alert" className="mb-6 border-l-4 border-error bg-panel p-4">
          {error}
        </p>
      )}
      {conflicts.length > 0 && (
        <section
          aria-label="Synchronization conflicts"
          className="mb-6 space-y-3"
        >
          {conflicts.map((conflict) => (
            <div
              key={`${conflict.orderId}:${conflict.status}`}
              role="alert"
              className="border-l-4 border-error bg-panel p-4"
            >
              <p className="font-bold">
                Conflict on order #{conflict.orderNumber} (
                {conflict.customerFirstName})
              </p>
              <p className="mt-1 text-sm">{conflict.conflict}</p>
              {onDismissConflict && (
                <Button
                  className="mt-3"
                  onClick={() => onDismissConflict(conflict.orderId)}
                >
                  Dismiss conflict
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {projectedOrders === null ? (
        error ? (
          <div className="py-8">
            <p>Queue is unavailable.</p>
            <Button className="mt-4" onClick={onRetry}>
              Retry queue
            </Button>
          </div>
        ) : (
          <p role="status" className="py-8 text-muted">
            Loading queue…
          </p>
        )
      ) : projectedOrders.length === 0 ? (
        <p className="py-8 text-muted">No pending orders in the queue.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectedOrders.map((order) => {
            const pendingUpdate = pendingByOrder.get(order.id);
            const isPendingSync = Boolean(
              pendingUpdate && !pendingUpdate.conflict,
            );
            const isUpdating = updatingIds.includes(order.id);
            const actionLabel = statusActionLabel(order.status);
            return (
              <article
                key={order.id}
                className={
                  order.status === "ready"
                    ? "animate-arrive flex flex-col justify-between border-t-[6px] border-signal bg-panel p-4"
                    : "rule flex flex-col justify-between bg-panel p-4"
                }
              >
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="numeral text-5xl font-bold">
                      {order.order_number}
                    </p>
                    <p
                      className={
                        order.status === "ready"
                          ? "eyebrow text-ink"
                          : "eyebrow"
                      }
                    >
                      {queueStatusLabel(order.status)}
                      {isPendingSync && " · Pending sync"}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xl font-bold">
                    {order.customer_first_name}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span className="numeral font-bold">
                          {item.quantity}×
                        </span>{" "}
                        {formatQueueItemDetails(item)}
                      </li>
                    ))}
                  </ul>
                </div>
                {actionLabel && (
                  <Button
                    variant={order.status === "ready" ? "secondary" : "primary"}
                    block
                    className="mt-4"
                    disabled={isUpdating || !pendingReady}
                    onClick={() => onAdvance?.(order)}
                  >
                    {isUpdating ? "Updating…" : actionLabel}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function BaristaQueue({ staff }: { staff: Staff }) {
  const [orders, setOrders] = useState<QueueOrder[] | null>(() =>
    readCachedQueue(staff.id),
  );
  const [pendingUpdates, setPendingUpdates] = useState<PendingStatusUpdate[]>(
    [],
  );
  const [pendingReady, setPendingReady] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const pendingFetch = useRef<Promise<QueueOrder[]> | null>(null);
  const syncing = useRef(false);
  const pendingRef = useRef<PendingStatusUpdate[]>([]);
  const inFlightOrders = useRef<Set<string>>(new Set());

  useEffect(() => {
    pendingRef.current = pendingUpdates;
  }, [pendingUpdates]);

  const savePending = useCallback(
    async (next: PendingStatusUpdate[]) => {
      try {
        await updateSnapshot(staff, { pending: next });
        pendingRef.current = next;
        setPendingUpdates(next);
        return true;
      } catch {
        setError("Could not save pending updates on this device.");
        return false;
      }
    },
    [staff],
  );

  useEffect(() => {
    let live = true;
    void offlineStore.snapshots
      .get(staff.id)
      .then(async (snapshot) => {
        if (!live) return;
        if (snapshot) setOrders(snapshot.orders);
        let pending = snapshot?.pending ?? [];
        const legacy = readPendingUpdates(staff.id);
        if (legacy.length) {
          pending = [
            ...pending.filter(
              (u) => !legacy.some((v) => v.orderId === u.orderId),
            ),
            ...legacy,
          ];
          await updateSnapshot(staff, { pending });
        }
        if (!live) return;
        pendingRef.current = pending;
        setPendingUpdates(pending);
        setPendingReady(true);
        try {
          sessionStorage.removeItem(pendingUpdatesStorageKey(staff.id));
        } catch {
          // IndexedDB now holds the pending updates.
        }
      })
      .catch(() =>
        setError(
          "Offline storage is unavailable. Pending updates may not be retained.",
        ),
      );
    return () => {
      live = false;
    };
  }, [staff]);

  const refresh = useCallback((): Promise<QueueOrder[]> => {
    if (pendingFetch.current) return pendingFetch.current;
    pendingFetch.current = requestJson<{ orders: unknown }>("/api/queue/orders")
      .then((data) => {
        const parsed = parseQueueOrders(data?.orders);
        if (!parsed) {
          throw new Error(
            "Cannot load the order queue. Check your connection and retry.",
          );
        }
        if (active.current) {
          setOrders(parsed);
          writeCachedQueue(staff.id, parsed);
          void updateSnapshot(staff, { orders: parsed }).catch(() =>
            setError("Could not cache the queue on this device."),
          );
          setConnected(true);
          setError("");
        }
        return parsed;
      })
      .catch((e) => {
        if (active.current) {
          setConnected(false);
          setError(
            e instanceof TypeError
              ? "No connection. Previously loaded orders remain visible."
              : e instanceof Error
                ? e.message
                : "Cannot refresh the order queue. Reconnect and try again.",
          );
        }
        throw e;
      })
      .finally(() => {
        pendingFetch.current = null;
      });
    return pendingFetch.current;
  }, [staff]);

  const syncPending = useCallback(async () => {
    if (!pendingReady || syncing.current || isBrowserOffline()) return;
    const queue = pendingRef.current.filter((u) => !u.conflict);
    if (queue.length === 0) return;
    syncing.current = true;
    try {
      for (const item of queue) {
        if (!active.current || isBrowserOffline()) break;
        const response = await fetch("/api/queue/orders", {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: item.orderId,
            expectedVersion: item.expectedVersion,
            status: item.status,
          }),
        });
        if (response.ok) {
          if (
            !(await savePending(
              pendingRef.current.filter(
                (u) =>
                  !(
                    u.orderId === item.orderId &&
                    u.expectedVersion === item.expectedVersion
                  ),
              ),
            ))
          )
            break;
          continue;
        }
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.dispatchEvent(new Event("staff-session-ended"));
          break;
        }
        if (response.status === 409 || response.status === 404) {
          const message =
            payload?.error ??
            "This offline status update conflicted with a change made by another barista. Review the current queue status.";
          if (
            !(await savePending(
              pendingRef.current.map((u) =>
                u.orderId === item.orderId ? { ...u, conflict: message } : u,
              ),
            ))
          )
            break;
          continue;
        }
        // Temporary failure: retain in pending queue for later retry.
        break;
      }
      if (active.current && !isBrowserOffline()) {
        await refresh().catch(() => {});
      }
    } catch {
      // Network dropped mid-sync; retain remaining pending updates for retry.
    } finally {
      syncing.current = false;
    }
  }, [pendingReady, refresh, savePending]);

  useEffect(() => {
    active.current = true;
    const load = () => {
      if (document.visibilityState === "visible") {
        void syncPending().then(() => refresh().catch(() => {}));
      }
    };
    const offline = () => {
      setConnected(false);
      setError("No connection. Previously loaded orders remain visible.");
    };
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener("online", load);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", load);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("online", load);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh, syncPending]);

  async function advanceOrder(order: QueueOrder) {
    if (!pendingReady || inFlightOrders.current.has(order.id)) return;
    const next = nextOrderStatus(order.status);
    if (!next) return;

    const isOffline = navigator.onLine === false || !connected;
    if (isOffline) {
      inFlightOrders.current.add(order.id);
      setUpdatingIds((prev) => [...prev, order.id]);
      const filtered = pendingRef.current.filter(
        (u) =>
          !(
            u.orderId === order.id &&
            (u.expectedVersion === order.version || Boolean(u.conflict))
          ),
      );
      await savePending([
        ...filtered,
        {
          orderId: order.id,
          orderNumber: order.order_number,
          customerFirstName: order.customer_first_name,
          fromStatus: order.status,
          status: next,
          expectedVersion: order.version,
        },
      ]);
      inFlightOrders.current.delete(order.id);
      setUpdatingIds((prev) => prev.filter((id) => id !== order.id));
      return;
    }

    inFlightOrders.current.add(order.id);
    setUpdatingIds((prev) => [...prev, order.id]);
    setError("");
    try {
      await requestJson("/api/queue/orders", {
        method: "PATCH",
        body: JSON.stringify({
          orderId: order.id,
          expectedVersion: order.version,
          status: next,
        }),
      });
      if (!active.current) return;
      setOrders((prev) => {
        if (!prev) return prev;
        const nextList =
          next === "preparing" || next === "ready"
            ? prev.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      status: next,
                      version: o.version + 1,
                    }
                  : o,
              )
            : prev.filter((o) => o.id !== order.id);
        writeCachedQueue(staff.id, nextList);
        void updateSnapshot(staff, { orders: nextList });
        return nextList;
      });
      void refresh().catch(() => {});
    } catch (e) {
      if (!active.current) return;
      setError(
        e instanceof TypeError
          ? "Could not reach the server to confirm the status change. Check your connection and retry."
          : e instanceof Error
            ? e.message
            : "Status update failed. Review the order and retry.",
      );
      void refresh().catch(() => {});
    } finally {
      inFlightOrders.current.delete(order.id);
      if (active.current) {
        setUpdatingIds((prev) => prev.filter((id) => id !== order.id));
      }
    }
  }

  async function dismissConflict(orderId: string) {
    if (
      await savePending(pendingRef.current.filter((u) => u.orderId !== orderId))
    )
      void refresh().catch(() => {});
  }

  return (
    <BaristaQueueView
      orders={orders}
      pendingUpdates={pendingUpdates}
      pendingReady={pendingReady}
      updatingIds={updatingIds}
      connected={connected}
      error={error}
      onRetry={() => void refresh().catch(() => {})}
      onAdvance={(order) => void advanceOrder(order)}
      onDismissConflict={dismissConflict}
    />
  );
}
