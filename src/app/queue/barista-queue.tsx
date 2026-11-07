"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { requestJson } from "@/components/staff-workspace";
import {
  formatQueueItemDetails,
  parseQueueOrders,
  queueStatusLabel,
  type QueueOrder,
} from "@/lib/queue";
import type { Staff } from "@/lib/staff-server";

const POLL_MS = 3000;

export function queueStorageKey(staffId: string): string {
  return `bb-queue-orders:${staffId}`;
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

export function BaristaQueueView({
  orders,
  connected,
  error,
  onRetry,
}: {
  orders: QueueOrder[] | null;
  connected: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <p className="eyebrow">Queue / 02</p>
          <h1 className="headline mt-2">Barista queue</h1>
        </div>
        <p className="text-muted" role="status">
          {connected
            ? "Connected · queue updates automatically"
            : "Offline · showing last loaded orders"}
        </p>
      </div>
      {error && (
        <p role="alert" className="mb-6 border-l-4 border-error bg-panel p-4">
          {error}
        </p>
      )}
      {orders === null ? (
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
      ) : orders.length === 0 ? (
        <p className="py-8 text-muted">No pending orders in the queue.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <article key={order.id} className="rule bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="numeral text-5xl font-bold">
                  {order.order_number}
                </p>
                <p className="eyebrow">{queueStatusLabel(order.status)}</p>
              </div>
              <p className="mt-1 truncate text-xl font-bold">
                {order.customer_first_name}
              </p>
              <ul className="mt-3 space-y-1">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span className="numeral font-bold">{item.quantity}×</span>{" "}
                    {formatQueueItemDetails(item)}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function BaristaQueue({ staff }: { staff: Staff }) {
  const [orders, setOrders] = useState<QueueOrder[] | null>(() =>
    readCachedQueue(staff.id),
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const pending = useRef<Promise<QueueOrder[]> | null>(null);

  const refresh = useCallback((): Promise<QueueOrder[]> => {
    if (pending.current) return pending.current;
    pending.current = requestJson<{ orders: unknown }>("/api/queue/orders")
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
        pending.current = null;
      });
    return pending.current;
  }, [staff.id]);

  useEffect(() => {
    active.current = true;
    const load = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine !== false
      ) {
        void refresh().catch(() => {});
      }
    };
    const offline = () => {
      setConnected(false);
      setError("No connection. Previously loaded orders remain visible.");
    };
    if (navigator.onLine === false) {
      offline();
    } else {
      load();
    }
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
  }, [refresh]);

  return (
    <BaristaQueueView
      orders={orders}
      connected={connected}
      error={error}
      onRetry={() => void refresh().catch(() => {})}
    />
  );
}
