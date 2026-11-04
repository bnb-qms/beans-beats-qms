"use client";

import { useEffect, useState } from "react";
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
    <main className="flex flex-1 flex-col bg-zinc-950 p-8 text-white">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-5xl font-bold">Ready for pickup</h1>
        <div className="flex items-center gap-4">
          {reconnecting && (
            <span className="rounded-full bg-amber-500 px-4 py-1 text-lg font-semibold text-black">
              Reconnecting...
            </span>
          )}
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen()}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-lg hover:bg-zinc-800"
          >
            Fullscreen
          </button>
        </div>
      </header>

      {orders !== null && orders.length === 0 && (
        <p className="mt-16 text-center text-4xl text-zinc-400">
          No orders ready yet
        </p>
      )}

      <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
        {orders?.map((order) => (
          <li
            key={order.order_number}
            className="rounded-2xl bg-lime-400 p-6 text-center text-black"
          >
            <p className="text-7xl font-bold">{order.order_number}</p>
            <p className="mt-2 truncate text-4xl font-semibold">
              {order.customer_first_name}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
