"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { guestStatuses } from "@/lib/guest-order";
import {
  initialGuestState,
  watchGuestOrder,
  type GuestTrackingState,
} from "./watch-order";

const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function GuestStatus({ id }: { id: string }) {
  const [result, setResult] = useState(initialGuestState);
  const watcher = useRef<ReturnType<typeof watchGuestOrder> | null>(null);
  const sample = !configured && id === "example";

  useEffect(() => {
    const subscription = watchGuestOrder(id, setResult);
    watcher.current = subscription;
    return () => subscription.stop();
  }, [id]);

  return (
    <GuestStatusView
      result={result}
      sample={sample}
      onRefresh={() => watcher.current?.refresh()}
    />
  );
}

export function GuestStatusView({
  result,
  sample,
  onRefresh,
}: {
  result: GuestTrackingState;
  sample: boolean;
  onRefresh: () => void;
}) {
  const order = result.kind === "order" ? result.order : null;
  const status = order ? guestStatuses[order.status] : null;
  return (
    <main
      className={`flex min-h-dvh flex-1 flex-col ${order?.status === "ready" ? "bg-signal text-ink" : "bg-paper text-ink"}`}
      style={{
        padding:
          "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
      }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <header className="flex flex-wrap justify-between gap-3 border-b-[3px] border-ink pb-4">
          <p className="eyebrow">Beans&amp;Beats / Your order</p>
          {sample && <span className="eyebrow">Sample data</span>}
        </header>
        <section className="py-10" aria-live="polite" aria-atomic="true">
          {order && status ? (
            <>
              <p className="eyebrow">Pickup number</p>
              <h1 className="display numeral mt-3">#{order.order_number}</h1>
              <p className="mt-3">
                Event date:{" "}
                <time dateTime={order.event_day}>{order.event_day}</time>
              </p>
              <h2 className="headline mt-8">{status.label}</h2>
              <p className="mt-4 text-xl">
                {order.status === "ready"
                  ? `Order #${order.order_number} is ready. Please collect at the booth.`
                  : status.explanation}
              </p>
            </>
          ) : (
            <>
              <h1 className="headline">
                {result.kind === "loading"
                  ? "Loading order…"
                  : result.kind === "error"
                    ? "Connection unavailable"
                    : "Order unavailable"}
              </h1>
              <p className="mt-4 text-lg">
                {result.kind === "error"
                  ? "We could not check your order. Retrying when connected."
                  : result.kind === "unavailable"
                    ? "This tracking link is unavailable or has expired. Please check with counter staff."
                    : "Checking your order’s confirmed status."}
              </p>
            </>
          )}
        </section>
        <div className="mb-5 text-sm">
          {result.reconnecting && (
            <p role="status" className="mb-2 font-bold">
              Reconnecting — status may be out of date
            </p>
          )}
          {result.lastUpdated !== null && (
            <p>
              Last confirmed update:{" "}
              <time dateTime={new Date(result.lastUpdated).toISOString()}>
                {new Date(result.lastUpdated).toLocaleTimeString()}
              </time>
            </p>
          )}
          {order && !sample && !result.reconnecting && (
            <p>Updates automatically while this page is visible.</p>
          )}
        </div>
        {result.kind !== "unavailable" && (
          <Button
            block
            disabled={result.kind === "loading"}
            onClick={onRefresh}
          >
            {result.kind === "error" ? "Retry status" : "Refresh status"}
          </Button>
        )}
        <footer className="mt-auto border-t-[3px] border-ink pt-5 text-sm">
          <h2 className="font-bold">Your privacy</h2>
          <p className="mt-2">
            We collect your first name to prepare and identify your order. It
            appears with your pickup number on the public ready board. A mobile
            number is optional and stored only with your consent for order
            follow-up. No automatic SMS is sent.
          </p>
          <p className="mt-2">
            Names and mobile numbers are deleted within 30 days after the event
            ends on 29 November 2026. Sales records are kept without personal
            details. For questions or requests about your data, speak to counter
            staff.
          </p>
          <p className="my-4">
            Keep your tracking link private: anyone with it can view this
            order’s number, date and status.
          </p>
        </footer>
      </div>
    </main>
  );
}
