"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { createClient } from "@/lib/supabase/client";
import {
  guestStatuses,
  isGuestOrder,
  TRACKING_TOKEN,
  type GuestOrder,
} from "@/lib/guest-order";

type Result =
  | { kind: "loading" | "unavailable" | "error" }
  | { kind: "order"; order: GuestOrder };
const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function GuestStatus({ id }: { id: string }) {
  const [result, setResult] = useState<Result>({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const sample = !configured && id === "example";

  useEffect(() => {
    let active = true;
    async function load() {
      setResult({ kind: "loading" });
      // shortcut: the explicit example page uses labelled sample data until Supabase is configured.
      if (sample) {
        setResult({
          kind: "order",
          order: {
            order_number: 12,
            event_day: "2026-11-07",
            status: "queued",
          },
        });
        return;
      }
      const token = window.location.hash.slice(1);
      if (id !== "track" || !TRACKING_TOKEN.test(token)) {
        setResult({ kind: "unavailable" });
        return;
      }
      try {
        if (!configured) throw new Error();
        const { data, error } = await createClient().rpc("guest_order_status", {
          p_tracking_token: token,
        });
        if (error) throw new Error();
        if (!active) return;
        if (Array.isArray(data) && data.length === 0) {
          setResult({ kind: "unavailable" });
        } else if (
          Array.isArray(data) &&
          data.length === 1 &&
          isGuestOrder(data[0])
        ) {
          setResult({ kind: "order", order: data[0] });
        } else throw new Error();
      } catch {
        if (active) setResult({ kind: "error" });
      }
    }
    void load();
    const hashChanged = () => {
      active = false;
      setRefresh((n) => n + 1);
    };
    window.addEventListener("hashchange", hashChanged);
    return () => {
      active = false;
      window.removeEventListener("hashchange", hashChanged);
    };
  }, [id, refresh, sample]);

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
              <p className="mt-4 text-xl">{status.explanation}</p>
              <p className="mt-6 text-sm">
                Latest confirmed status. Refresh to check for updates.
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
                  ? "We could not check your order. Please retry when connected."
                  : result.kind === "unavailable"
                    ? "This tracking link is unavailable or has expired. Please check with counter staff."
                    : "Checking your order’s confirmed status."}
              </p>
            </>
          )}
        </section>
        {result.kind !== "unavailable" && (
          <Button
            block
            disabled={result.kind === "loading"}
            onClick={() => setRefresh((n) => n + 1)}
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
