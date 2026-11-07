"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/button";
import { inputClass } from "@/components/staff-workspace";
import { useMenu } from "@/components/use-menu";
import {
  allowsMilk,
  cents,
  lineTotal,
  unavailable,
  validateDraft,
  type Draft,
  type Line,
  type Receipt,
} from "@/lib/order";
import { formatPrice } from "@/lib/format-price";
import type { Staff } from "@/lib/staff-server";
import { offlineStore, type PendingOrder } from "@/lib/offline-store";

type Attempt = { draft: Draft; totalCents: number };
type Saved = { draft: Draft; attempt: Attempt | null; receipt: Receipt | null };
function emptyDraft(): Draft {
  return {
    requestId: crypto.randomUUID(),
    firstName: "",
    mobile: "",
    consent: false,
    lines: [],
  };
}

export function OrderEntry({ staff }: { staff: Staff }) {
  const { menu, connected, error: menuError, refresh } = useMenu(staff);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const load = () =>
      void offlineStore.pendingOrders
        .where("staffId")
        .equals(staff.id)
        .toArray()
        .then(setPendingOrders);
    load();
    window.addEventListener("offline-orders-changed", load);
    return () => {
      active.current = false;
      window.removeEventListener("offline-orders-changed", load);
    };
  }, [staff.id]);
  const lastTotal = useRef<{ requestId: string; total: number } | null>(null);
  const storageKey = `bb-counter-draft:${staff.id}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        const data = raw ? JSON.parse(raw) : null;
        if (
          data?.draft &&
          Array.isArray(data.draft.lines) &&
          typeof data.draft.firstName === "string"
        )
          setSaved(data);
        else setSaved({ draft: emptyDraft(), attempt: null, receipt: null });
      } catch {
        setSaved({ draft: emptyDraft(), attempt: null, receipt: null });
        setMessage(
          "Could not restore the draft. Check your order before continuing.",
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  function persist(next: Saved): boolean {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      return true;
    } catch {
      setMessage(
        "This browser cannot retain your draft. Enable browser storage before submitting.",
      );
      return false;
    }
  }
  const draft = saved?.draft;
  const total =
    draft && menu
      ? draft.lines.reduce((sum, line) => sum + lineTotal(line, menu), 0)
      : 0;
  useEffect(() => {
    if (
      lastTotal.current?.requestId === draft?.requestId &&
      lastTotal.current?.total !== total &&
      draft?.lines.length &&
      !saved?.attempt
    )
      setMessage(
        "The draft total has updated. Check the amount before taking POS payment.",
      );
    lastTotal.current =
      draft && menu ? { requestId: draft.requestId, total } : null;
  }, [total, draft, menu, saved?.attempt]);
  if (!saved || !draft)
    return (
      <p className="py-12" role="status">
        Restoring draft…
      </p>
    );
  const locked = busy || !!saved.attempt;
  function change(next: Draft) {
    if (locked) return;
    setMessage("");
    persist({
      draft: { ...next, requestId: crypto.randomUUID() },
      attempt: null,
      receipt: null,
    });
    void refresh().catch(() => {});
  }
  function edit(line: Line, patch: Partial<Line>) {
    change({
      ...draft!,
      lines: draft!.lines.map((l) =>
        l.id === line.id ? { ...l, ...patch } : l,
      ),
    });
  }
  async function submit() {
    if (sending.current || !menu) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    let attempt = saved!.attempt;
    try {
      if (!connected || !navigator.onLine) {
        if (
          !validateDraft(draft!) ||
          !menu ||
          draft!.lines.some((line) => unavailable(line, menu))
        )
          throw new Error("Check the order details before saving it offline.");
        const pendingAttempt = attempt ?? { draft: draft!, totalCents: total };
        const pending = {
          requestId: pendingAttempt.draft.requestId,
          staffId: staff.id,
          attempt: pendingAttempt,
        };
        await offlineStore.pendingOrders.put(pending);
        setPendingOrders((previous) => [
          ...previous.filter((p) => p.requestId !== pending.requestId),
          pending,
        ]);
        persist({ draft: emptyDraft(), attempt: null, receipt: null });
        setMessage(
          "Order saved on this device. It will reach the barista queue after reconnection. No pickup number is available yet.",
        );
        return;
      }
      if (!attempt) {
        const latest = await refresh();
        if (!active.current) return;
        const problem = draft!.lines
          .map((line) => unavailable(line, latest))
          .find(Boolean);
        const latestTotal = draft!.lines.reduce(
          (sum, line) => sum + lineTotal(line, latest),
          0,
        );
        if (problem)
          throw new Error(
            `${problem} If payment was taken, reconcile it on the POS before changing this order.`,
          );
        if (latestTotal !== total)
          throw new Error(
            "The total changed. Check and reconcile any POS payment before submitting again.",
          );
        attempt = { draft: draft!, totalCents: total };
        if (!persist({ ...saved!, attempt })) return;
      }
      const response = await fetch("/api/counter/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 || response.status === 400) {
          persist({
            ...saved!,
            draft: { ...draft!, requestId: crypto.randomUUID() },
            attempt: null,
          });
          void refresh().catch(() => {});
        }
        if (response.status === 401)
          window.dispatchEvent(new Event("staff-session-ended"));
        throw new Error(
          data.error ?? "Order not confirmed. Retry this same submission.",
        );
      }
      persist({ draft: emptyDraft(), attempt: null, receipt: data as Receipt });
    } catch (e) {
      if (e instanceof TypeError && attempt) {
        const pending = {
          requestId: attempt.draft.requestId,
          staffId: staff.id,
          attempt,
        };
        try {
          await offlineStore.pendingOrders.put(pending);
          setPendingOrders((previous) => [
            ...previous.filter((p) => p.requestId !== pending.requestId),
            pending,
          ]);
          persist({ draft: emptyDraft(), attempt: null, receipt: null });
          setMessage(
            "Connection lost during submission. This order will retry automatically with the same request ID. Do not take payment again.",
          );
          return;
        } catch {
          // Keep the original attempt locked for manual retry if storage fails.
        }
      }
      setMessage(
        e instanceof Error
          ? e.message
          : "Order not confirmed. Retry this same submission; do not enter it again.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const receipt = saved.receipt;
  if (receipt)
    return (
      <section className="mx-auto max-w-2xl py-10">
        <p className="eyebrow">Order received · {receipt.event_day}</p>
        <h1 className="display numeral mt-4">#{receipt.order_number}</h1>
        <p className="mt-6 text-2xl font-bold">{receipt.customer_first_name}</p>
        <ul className="my-6 divide-y divide-hair">
          {receipt.items.map((item, index) => (
            <li className="py-3" key={index}>
              <strong>
                {item.quantity} × {item.menu_item_name}
              </strong>
              <p className="text-muted">
                {item.order_item_add_ons
                  .map((a) => a.add_on_name)
                  .join(" · ") || "Hot · standard"}
              </p>
            </li>
          ))}
        </ul>
        <p className="section-title flex justify-between">
          Charged total{" "}
          <span className="numeral">
            {formatPrice(cents(receipt.total_amount))}
          </span>
        </p>
        <p className="my-5 text-muted">
          Saved once in the barista queue. Keep the pickup number for
          collection.
        </p>
        {receipt.tracking_url && receipt.tracking_qr ? (
          <div className="rule my-6 bg-panel p-5 text-center">
            <h2 className="section-title">Scan to track your order</h2>
            <Image
              src={receipt.tracking_qr}
              alt={`Tracking QR for pickup number ${receipt.order_number}`}
              width={320}
              height={320}
              unoptimized
              className="mx-auto my-4 h-auto max-w-full"
            />
            <a
              href={receipt.tracking_url}
              referrerPolicy="no-referrer"
              className="inline-flex min-h-tap items-center underline underline-offset-4"
            >
              Open order status
            </a>
            <p className="mt-2 text-muted">
              Keep this link private. No account or mobile number needed.
            </p>
          </div>
        ) : (
          <p role="status" className="my-5 text-muted">
            {receipt.tracking_warning ||
              "Tracking is unavailable for this saved receipt. Keep the pickup number and check with counter staff."}
          </p>
        )}
        <Button
          variant="primary"
          block
          onClick={() => {
            if (persist({ draft: emptyDraft(), attempt: null, receipt: null }))
              setMessage("");
          }}
        >
          Take next order
        </Button>
        {message && (
          <p role="alert" className="mt-4 text-error">
            {message}
          </p>
        )}
      </section>
    );
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <p className="eyebrow">Counter / 01</p>
          <h1 className="headline mt-2">Take an order</h1>
        </div>
        <p className="text-muted" role="status">
          {connected
            ? "Connected · menu updates automatically"
            : "Connection unavailable · draft retained"}
        </p>
      </div>
      {menuError && (
        <p role="alert" className="mb-6 border-l-4 border-error bg-panel p-4">
          {menuError}
        </p>
      )}
      {pendingOrders.length > 0 && (
        <p role="status" className="mb-6 border-l-4 border-signal bg-panel p-4">
          {pendingOrders.length} order{pendingOrders.length === 1 ? "" : "s"}{" "}
          pending submission.{" "}
          {pendingOrders.find((order) => order.error)?.error}
        </p>
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Drink menu">
          <h2 className="section-title mb-4">Choose drinks</h2>
          {!menu && (
            <div className="py-8">
              <p>Menu is unavailable.</p>
              <Button
                className="mt-4"
                onClick={() => void refresh().catch(() => {})}
              >
                Retry menu
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {menu?.drinks
              .filter((d) => d.is_active)
              .map((drink) => (
                <article
                  className="rule flex min-h-40 flex-col justify-between bg-panel p-5"
                  key={drink.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-bold capitalize">
                      {drink.name}
                    </h3>
                    <span className="numeral font-bold">
                      {formatPrice(cents(drink.base_price))}
                    </span>
                  </div>
                  <Button
                    className="mt-5"
                    disabled={locked || !drink.is_available}
                    onClick={() =>
                      change({
                        ...draft,
                        lines: [
                          ...draft.lines,
                          {
                            id: crypto.randomUUID(),
                            menu_item_id: drink.id,
                            quantity: 1,
                            add_on_ids: [],
                          },
                        ],
                      })
                    }
                  >
                    {drink.is_available ? `Add ${drink.name}` : "Sold out"}
                  </Button>
                </article>
              ))}
          </div>
          <h2 className="section-title mb-4 mt-8">
            Order details{" "}
            <span className="text-muted">/ {draft.lines.length}</span>
          </h2>
          {!draft.lines.length && (
            <p className="py-6 text-muted">
              Start with a drink. Quantities and options can be changed here.
            </p>
          )}
          <div className="grid gap-4">
            {draft.lines.map((line, index) => {
              const drink = menu?.drinks.find(
                (d) => d.id === line.menu_item_id,
              );
              const problem = menu ? unavailable(line, menu) : null;
              return (
                <article className="rule bg-panel p-5" key={line.id}>
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-bold capitalize">
                      {drink?.name ?? "Unavailable drink"}
                    </h3>
                    <Button
                      variant="quiet"
                      disabled={locked}
                      aria-label={`Remove ${drink?.name ?? "drink"} line ${index + 1}`}
                      onClick={() =>
                        change({
                          ...draft,
                          lines: draft.lines.filter((l) => l.id !== line.id),
                        })
                      }
                    >
                      Remove drink
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[7rem_1fr]">
                    <label className="grid gap-2">
                      Quantity
                      <input
                        className={inputClass}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="100"
                        step="1"
                        value={line.quantity || ""}
                        disabled={locked}
                        onChange={(e) =>
                          edit(line, { quantity: Number(e.target.value) })
                        }
                      />
                    </label>
                    <fieldset
                      disabled={locked}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <legend className="mb-2">
                        Options ·{" "}
                        {drink && allowsMilk(drink.name)
                          ? "hot / regular"
                          : "hot"}{" "}
                        by default
                      </legend>
                      {menu?.addOns
                        .filter(
                          (a) =>
                            a.name === "iced" ||
                            (a.name === "oat milk" &&
                              drink &&
                              allowsMilk(drink.name)),
                        )
                        .map((option) => (
                          <label
                            key={option.id}
                            className={`flex min-h-tap items-center gap-3 border-2 px-3 ${line.add_on_ids.includes(option.id) ? "border-ink bg-paper" : "border-hair"}`}
                          >
                            <input
                              className="size-5 accent-ink"
                              type="checkbox"
                              checked={line.add_on_ids.includes(option.id)}
                              disabled={
                                !option.is_available &&
                                !line.add_on_ids.includes(option.id)
                              }
                              onChange={(e) =>
                                edit(line, {
                                  add_on_ids: e.target.checked
                                    ? [...line.add_on_ids, option.id]
                                    : line.add_on_ids.filter(
                                        (id) => id !== option.id,
                                      ),
                                })
                              }
                            />
                            <span className="capitalize">
                              {option.name}{" "}
                              <span className="numeral">
                                +{formatPrice(cents(option.price))}
                              </span>
                              {!option.is_available && " · unavailable"}
                            </span>
                          </label>
                        ))}
                    </fieldset>
                  </div>
                  {problem && (
                    <p className="mt-3 text-error" role="alert">
                      {problem}
                    </p>
                  )}
                  {(!Number.isInteger(line.quantity) ||
                    line.quantity < 1 ||
                    line.quantity > 100) && (
                    <p role="alert" className="mt-3 text-error">
                      Enter a whole-number quantity from 1 to 100.
                    </p>
                  )}
                  <p className="numeral mt-3 text-right font-bold">
                    {menu ? formatPrice(lineTotal(line, menu)) : "—"}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
        <aside className="rule bg-panel p-6 lg:sticky lg:top-6">
          <h2 className="text-xl font-bold">Guest &amp; total</h2>
          <label className="mt-5 grid gap-2 font-bold">
            First name (required)
            <input
              className={inputClass}
              maxLength={20}
              autoComplete="off"
              value={draft.firstName}
              disabled={locked}
              onChange={(e) => change({ ...draft, firstName: e.target.value })}
            />
          </label>
          <details className="mt-4">
            <summary className="min-h-tap cursor-pointer py-3 text-muted">
              Optional mobile number
            </summary>
            <label className="grid gap-2">
              Singapore mobile
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                maxLength={8}
                autoComplete="off"
                value={draft.mobile}
                disabled={locked}
                onChange={(e) => change({ ...draft, mobile: e.target.value })}
              />
            </label>
            <label className="mt-3 flex min-h-tap items-start gap-3">
              <input
                className="mt-1 size-5 shrink-0 accent-ink"
                type="checkbox"
                checked={draft.consent}
                disabled={locked}
                onChange={(e) =>
                  change({ ...draft, consent: e.target.checked })
                }
              />
              <span>
                The guest agrees to this number being used for follow-up about
                this order. No automatic SMS is sent.
              </span>
            </label>
          </details>
          {draft.mobile &&
            (!/^[89]\d{7}$/.test(draft.mobile) || !draft.consent) && (
              <p role="alert" className="mt-3 text-error">
                Enter an 8-digit Singapore mobile starting with 8 or 9 and
                confirm consent, or leave the number blank.
              </p>
            )}
          <p className="mt-4 text-sm text-muted">
            First name appears on the public pickup board. Mobile is optional
            and visible only to staff.
          </p>
          <div className="mt-6 border-t-[3px] border-ink pt-4">
            <p className="eyebrow">Enter into the separate POS</p>
            <p className="numeral my-2 text-5xl font-bold">
              {formatPrice(saved.attempt?.totalCents ?? total)}
            </p>
            <p className="mb-5 text-muted">
              Take payment first. Then submit this order to the barista queue.
            </p>
          </div>
          {saved.attempt && (
            <p role="alert" className="mb-4 font-bold">
              Submission not yet confirmed. Retry the same order before taking
              another payment or editing it. Tracking is pending server
              confirmation.
            </p>
          )}
          <Button
            variant="primary"
            block
            disabled={
              busy ||
              !menu ||
              (!saved.attempt &&
                (!validateDraft(draft) ||
                  draft.lines.some((l) => unavailable(l, menu))))
            }
            onClick={submit}
          >
            {busy
              ? "Submitting…"
              : saved.attempt
                ? "Retry submission"
                : "Submit order"}
          </Button>
          <div aria-live="polite">
            {message && <p className="mt-4 text-error">{message}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
