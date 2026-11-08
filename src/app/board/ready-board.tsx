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

// shortcut: shows sample orders until the deployment has Supabase keys; remove once the database is linked.
const USE_SAMPLE = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const SAMPLE_ORDERS: ReadyOrder[] = [
  { order_number: 12, customer_first_name: "Arjun", ready_at: "10:01" },
  { order_number: 9, customer_first_name: "Siti", ready_at: "10:02" },
  { order_number: 15, customer_first_name: "Wei Ling", ready_at: "10:03" },
  { order_number: 17, customer_first_name: "Marcus", ready_at: "10:04" },
];

export function ReadyBoard() {
  const [orders, setOrders] = useState<ReadyOrder[] | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // Polling, not Realtime: the public cannot subscribe to the orders table.
    // Each poll is tagged; a response only applies if it is still the newest,
    // so a slow overlapping poll can never restore a collected order.
    let latest = 0;
    async function load() {
      const seq = ++latest;
      try {
        const { data, error } = USE_SAMPLE
          ? { data: SAMPLE_ORDERS, error: null }
          : await createClient().rpc("ready_orders");
        if (error) throw error;
        if (seq !== latest) return;
        const sorted = [...(data as ReadyOrder[])].sort((a, b) =>
          a.ready_at.localeCompare(b.ready_at),
        );
        setOrders(sorted);
        setReconnecting(false);
      } catch {
        if (seq !== latest) return;
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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="headline">Ready for pickup</h1>
        <div className="flex flex-wrap items-center gap-4">
          {USE_SAMPLE && (
            <span className="eyebrow text-faint">Sample data</span>
          )}
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

      <ul className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-8">
        {orders?.map((order) => (
          // New cards mount with the orange arrival flash; existing cards keep their key and stay still.
          <li
            key={order.order_number}
            className="animate-arrive min-w-0 border-t-[6px] border-signal pt-4"
          >
            <p className="numeral text-8xl font-bold leading-none">
              {order.order_number}
            </p>
            {order.customer_first_name && (
              <p className="mt-3 truncate text-4xl font-bold">
                {order.customer_first_name}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
