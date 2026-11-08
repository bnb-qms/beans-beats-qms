"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { guestStatuses, TRACKING_TOKEN } from "@/lib/guest-order";
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
  const [qr, setQr] = useState<string | null>(null);
  const watcher = useRef<ReturnType<typeof watchGuestOrder> | null>(null);
  const sample = !configured && id === "example";

  useEffect(() => {
    const subscription = watchGuestOrder(id, setResult);
    watcher.current = subscription;
    return () => subscription.stop();
  }, [id]);

  // F20: the tracking link doubles as the collection QR. Drawn on the phone, so it works offline.
  useEffect(() => {
    let live = true;
    const draw = () => {
      const token = window.location.hash.slice(1);
      if (id !== "track" || !TRACKING_TOKEN.test(token)) return setQr(null);
      void QRCode.toDataURL(`${window.location.origin}/o/track#${token}`, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((url) => live && setQr(url))
        .catch(() => live && setQr(null));
    };
    draw();
    window.addEventListener("hashchange", draw);
    return () => {
      live = false;
      window.removeEventListener("hashchange", draw);
    };
  }, [id]);

  return (
    <GuestStatusView
      result={result}
      sample={sample}
      qr={qr}
      onRefresh={() => watcher.current?.refresh()}
    />
  );
}

export function GuestStatusView({
  result,
  sample,
  qr = null,
  onRefresh,
}: {
  result: GuestTrackingState;
  sample: boolean;
  qr?: string | null;
  onRefresh: () => void;
}) {
  const order = result.kind === "order" ? result.order : null;
  const status = order ? guestStatuses[order.status] : null;
  return (
    <main
      className={`flex min-h-dvh flex-1 flex-col ${order?.status === "ready" ? "bg-signal text-ink [&_.eyebrow]:text-ink" : "bg-paper text-ink"}`}
      style={{
        padding:
          "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
      }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <header className="flex flex-wrap justify-between gap-4 border-b-[3px] border-ink pb-4">
          <p className="eyebrow">Beans&amp;Beats / Your order</p>
          {sample && <span className="eyebrow">Sample data</span>}
        </header>
        <section className="py-8" aria-live="polite" aria-atomic="true">
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
              {qr &&
                order.status !== "collected" &&
                order.status !== "cancelled" && (
                  <figure className="mt-8">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                    <img
                      src={qr}
                      width={240}
                      height={240}
                      alt={`Collection QR for order ${order.order_number}`}
                      className="border-[3px] border-ink bg-paper"
                    />
                    <figcaption className="mt-3 font-bold">
                      Show this QR at the pickup screen to collect your drink.
                    </figcaption>
                  </figure>
                )}
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
        <div className="mb-6 text-sm">
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
        <footer className="mt-auto border-t-[3px] border-ink pt-4 text-sm">
          <h2 className="font-bold">Your privacy</h2>
          <p className="mt-2">
            If you provide a first name, we use it to prepare and identify your
            order and show it with your pickup number on the public ready board.
            Otherwise, the board shows only your pickup number. A mobile number
            is optional and stored only with your consent for order follow-up.
            No automatic SMS is sent.
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
