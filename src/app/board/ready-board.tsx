"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { createClient } from "@/lib/supabase/client";

type ReadyOrder = {
  order_number: number;
  customer_first_name: string;
  ready_at: string;
};

// F9 FR6: a new ready order must show within 5 seconds.
const POLL_MS = 3000;

export function ReadyBoard() {
  const [orders, setOrders] = useState<ReadyOrder[] | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // Polling, not Realtime: the public cannot subscribe to the orders table.
    async function load() {
      try {
        const { data, error } = await createClient().rpc("ready_orders");
        if (error) throw error;
        const sorted = [...(data as ReadyOrder[])].sort((a, b) =>
          a.ready_at.localeCompare(b.ready_at),
        );
        setOrders(sorted);
        setReconnecting(false);
      } catch {
        // Keep showing the last list until the connection comes back (FR9).
        setReconnecting(true);
      }
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <main
      className="flex flex-1 flex-col bg-ink text-paper [color-scheme:dark]"
      style={{
        padding:
          "max(2rem, env(safe-area-inset-top)) max(2rem, env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(2rem, env(safe-area-inset-left))",
      }}
    >
      <header className="flex items-center justify-between gap-4">
        <h1 className="headline">Ready for pickup</h1>
        <div className="flex items-center gap-4">
          {reconnecting && (
            <span
              role="status"
              className="border-2 border-paper px-4 py-2 text-lg font-bold"
            >
              Reconnecting…
            </span>
          )}
          <Button onClick={() => document.documentElement.requestFullscreen()}>
            Fullscreen
          </Button>
        </div>
      </header>

      {orders !== null && orders.length === 0 && (
        <p className="mt-16 text-4xl font-bold text-faint">
          No orders ready yet
        </p>
      )}

      <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-8 gap-y-10">
        {orders?.map((order) => (
          // New cards mount with the orange arrival flash; existing cards keep their key and stay still.
          <li
            key={order.order_number}
            className="animate-arrive min-w-0 border-t-[6px] border-signal pt-4"
          >
            <p className="numeral text-8xl font-bold leading-none">
              {order.order_number}
            </p>
            <p className="mt-3 truncate text-4xl font-bold">
              {order.customer_first_name}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
