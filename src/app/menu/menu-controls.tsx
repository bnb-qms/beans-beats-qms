"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { inputClass, requestJson } from "@/components/staff-workspace";
import { useMenu } from "@/components/use-menu";
import { cents, type Drink, type AddOn } from "@/lib/order";
import { formatPrice } from "@/lib/format-price";
import {
  parsePrice,
  canChangeMenu,
  type MenuChange,
  type PriceChange,
  type AvailabilityChange,
  type DeactivationChange,
} from "@/lib/menu-change";
import type { Staff } from "@/lib/staff-server";

type Entry = { kind: "drink" | "option"; item: Drink | AddOn };
export function MenuControls({ staff }: { staff: Staff }) {
  const { menu, connected, error, refresh } = useMenu();
  const [edit, setEdit] = useState<(PriceChange & { name: string }) | null>(
    null,
  );
  const [availability, setAvailability] = useState<
    (AvailabilityChange & { name: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [deactivation, setDeactivation] = useState<
    (DeactivationChange & { name: string }) | null
  >(null);
  const panel = useRef<HTMLElement>(null);
  const panelKey = edit
    ? `price:${edit.id}`
    : availability
      ? `availability:${availability.id}`
      : deactivation
        ? `deactivate:${deactivation.id}`
        : "";
  useEffect(() => {
    if (!panelKey) return;
    panel.current?.scrollIntoView({ block: "nearest" });
    const input = panel.current?.querySelector("input");
    if (input) input.focus();
    else panel.current?.focus({ preventScroll: true });
  }, [panelKey]);
  const [notice, setNotice] = useState("");
  const entries: Entry[] = menu
    ? [
        ...menu.drinks
          .filter((item) => staff.role === "admin" || item.is_active)
          .map((item) => ({ kind: "drink" as const, item })),
        ...menu.addOns.map((item) => ({ kind: "option" as const, item })),
      ]
    : [];
  const current = entries.find(
    (e) => e.item.id === (edit?.id ?? availability?.id ?? deactivation?.id),
  )?.item;
  const priceOf = (item: Drink | AddOn) =>
    "base_price" in item ? item.base_price : item.price;
  async function save(change: MenuChange) {
    if (busy || !connected) return;
    setBusy(true);
    setNotice("");
    try {
      await requestJson("/api/counter/menu", {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      setEdit(null);
      setAvailability(null);
      setDeactivation(null);
      void refresh().catch(() => {});
      setNotice(
        change.action === "price"
          ? "Price saved. Connected order screens will use the new amount; past orders keep their recorded prices."
          : change.action === "availability"
            ? "Availability saved. Connected order screens will update; existing orders are unchanged."
            : "Drink deactivated. It is hidden from new orders; existing orders and history are retained.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Save not confirmed. Your input is retained; try again.",
      );
      void refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <p className="eyebrow">Menu / 05</p>
          <h1 className="headline mt-2">Menu controls</h1>
        </div>
        <p className="text-muted" role="status">
          {connected
            ? "Connected · saved changes reach order screens"
            : "Offline · changes paused"}
        </p>
      </div>
      <p className="mb-6 max-w-2xl text-muted">
        One shared menu for every counter. Prices apply to new orders; submitted
        orders keep their original totals.
      </p>
      {error && (
        <p role="alert" className="mb-4 border-l-4 border-error bg-panel p-4">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {notice && (
          <p className="mb-5 border-l-4 border-ink bg-panel p-4">{notice}</p>
        )}
      </div>
      {!menu && (
        <Button onClick={() => void refresh().catch(() => {})}>
          Retry menu
        </Button>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_23rem]">
        <div>
          {(["drink", "option"] as const).map((kind) => (
            <section key={kind} className="mb-8">
              <h2 className="section-title mb-4">
                {kind === "drink" ? "Drinks" : "Shared option surcharges"}
              </h2>
              <div className="divide-y divide-hair">
                {entries
                  .filter((e) => e.kind === kind)
                  .map(({ item }) => {
                    const active = !("is_active" in item) || item.is_active;
                    return (
                      <article
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-4"
                      >
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold capitalize">
                            {item.name}
                          </h3>
                          <p className="text-sm text-muted">
                            {!active
                              ? "Inactive"
                              : item.is_available
                                ? "Available"
                                : kind === "drink"
                                  ? "Sold out"
                                  : "Unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="numeral min-w-24 text-right text-xl font-bold">
                            {kind === "option" && "+"}
                            {formatPrice(cents(priceOf(item)))}
                          </span>
                          {canChangeMenu(staff.role, "availability") &&
                            active && (
                              <Button
                                disabled={busy || !connected}
                                onClick={() => {
                                  setEdit(null);
                                  setDeactivation(null);
                                  setNotice("");
                                  setAvailability({
                                    kind,
                                    id: item.id,
                                    version: item.version,
                                    action: "availability",
                                    value: !item.is_available,
                                    name: item.name,
                                  });
                                }}
                              >
                                {item.is_available
                                  ? kind === "drink"
                                    ? "Mark sold out"
                                    : "Mark unavailable"
                                  : "Mark available"}
                              </Button>
                            )}
                          {staff.role === "admin" && (
                            <Button
                              disabled={busy || !connected}
                              onClick={() => {
                                setAvailability(null);
                                setDeactivation(null);
                                setEdit({
                                  kind,
                                  id: item.id,
                                  version: item.version,
                                  action: "price",
                                  value: Number(priceOf(item)).toFixed(2),
                                  name: item.name,
                                });
                                setNotice("");
                              }}
                            >
                              Edit price
                            </Button>
                          )}
                          {staff.role === "admin" &&
                            kind === "drink" &&
                            active && (
                              <Button
                                variant="quiet"
                                className="text-error"
                                disabled={busy || !connected}
                                onClick={() => {
                                  setEdit(null);
                                  setAvailability(null);
                                  setNotice("");
                                  setDeactivation({
                                    kind: "drink",
                                    id: item.id,
                                    version: item.version,
                                    action: "deactivate",
                                    value: false,
                                    name: item.name,
                                  });
                                }}
                              >
                                Deactivate drink
                              </Button>
                            )}
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
        <aside
          ref={panel}
          tabIndex={-1}
          aria-label="Selected menu action"
          className="rule bg-panel p-6 lg:sticky lg:top-6 lg:self-start"
        >
          {edit ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(edit);
              }}
            >
              <p className="eyebrow">
                Edit {edit.kind === "option" ? "surcharge" : "base price"}
              </p>
              <h2 className="mt-2 text-2xl font-bold capitalize">
                {edit.name}
              </h2>
              <label className="mt-5 grid gap-2 font-bold">
                New price (SGD)
                <input
                  className={`${inputClass} numeral`}
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={edit.value}
                  disabled={busy}
                  onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                />
              </label>
              {parsePrice(edit.value) === null && (
                <p className="mt-2 text-error">
                  Enter zero or a positive amount with at most two decimal
                  places.
                </p>
              )}
              {current?.version !== edit.version && (
                <div className="mt-4 border-l-4 border-error pl-3">
                  <p>This item changed. Your entered value is retained.</p>
                  <p className="numeral mt-2">
                    Current saved price:{" "}
                    {current
                      ? formatPrice(cents(priceOf(current)))
                      : "Unavailable"}
                  </p>
                  <Button
                    className="mt-3"
                    disabled={busy || !current}
                    onClick={() => {
                      if (current)
                        setEdit({ ...edit, version: current.version });
                    }}
                  >
                    Review current version
                  </Button>
                </div>
              )}
              <p className="my-5 text-muted">
                {edit.kind === "option"
                  ? "Applies to every drink offering this option."
                  : "Updates new order pricing."}{" "}
                Past orders are unchanged.
              </p>
              <div className="grid gap-3">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={
                    busy ||
                    !connected ||
                    parsePrice(edit.value) === null ||
                    current?.version !== edit.version
                  }
                >
                  {busy ? "Saving…" : "Save price"}
                </Button>
                <Button disabled={busy} onClick={() => setEdit(null)}>
                  Cancel edit
                </Button>
              </div>
            </form>
          ) : availability ? (
            <section>
              <p className="eyebrow">Change availability</p>
              <h2 className="mt-2 text-2xl font-bold capitalize">
                {availability.name}
              </h2>
              <p className="my-5">
                Set this {availability.kind === "drink" ? "drink" : "option"} to{" "}
                <strong>
                  {availability.value
                    ? "Available"
                    : availability.kind === "drink"
                      ? "Sold out"
                      : "Unavailable"}
                </strong>
                .{" "}
                {availability.kind === "option"
                  ? "This applies to every drink offering it; other options remain usable."
                  : "This affects new orders only."}{" "}
                Existing orders are unchanged.
              </p>
              {current?.version !== availability.version && (
                <div role="alert" className="mb-4 border-l-4 border-error pl-3">
                  <p>
                    This item changed. Current availability:{" "}
                    {current?.is_available ? "Available" : "Unavailable"}.
                    Review before applying your choice.
                  </p>
                  <Button
                    className="mt-3"
                    disabled={busy || !current}
                    onClick={() => {
                      if (current)
                        setAvailability({
                          ...availability,
                          version: current.version,
                        });
                    }}
                  >
                    Review current version
                  </Button>
                </div>
              )}
              <div className="grid gap-3">
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    !connected ||
                    current?.version !== availability.version ||
                    (!!current && "is_active" in current && !current.is_active)
                  }
                  onClick={() => void save(availability)}
                >
                  {busy ? "Saving…" : "Save availability"}
                </Button>
                <Button disabled={busy} onClick={() => setAvailability(null)}>
                  Cancel change
                </Button>
              </div>
            </section>
          ) : deactivation ? (
            <section aria-label="Confirm drink deactivation">
              <p className="eyebrow">Confirm deactivation</p>
              <h2 className="mt-2 text-2xl font-bold capitalize">
                Deactivate {deactivation.name}?
              </h2>
              <p className="my-5">
                This drink will be hidden from new orders. Existing orders can
                still be prepared and collected, and all historical prices and
                quantities are retained. This does not delete the drink.
              </p>
              {current?.version !== deactivation.version && (
                <div role="alert" className="mb-4 border-l-4 border-error pl-3">
                  <p>
                    This drink changed. Review its current details before
                    confirming.
                  </p>
                  <Button
                    className="mt-3"
                    disabled={busy || !current}
                    onClick={() => {
                      if (current)
                        setDeactivation({
                          ...deactivation,
                          version: current.version,
                        });
                    }}
                  >
                    Review current version
                  </Button>
                </div>
              )}
              <div className="grid gap-3">
                <Button
                  variant="danger"
                  disabled={
                    busy ||
                    !connected ||
                    current?.version !== deactivation.version
                  }
                  onClick={() => void save(deactivation)}
                >
                  {busy ? "Deactivating…" : `Deactivate ${deactivation.name}`}
                </Button>
                <Button disabled={busy} onClick={() => setDeactivation(null)}>
                  Keep drink active
                </Button>
              </div>
            </section>
          ) : (
            <>
              <p className="eyebrow">Keep service moving</p>
              <h2 className="mt-2 text-2xl font-bold">
                A clear menu.
                <br />
                An accurate total.
              </h2>
              <p className="mt-4 text-muted">
                {staff.role === "admin"
                  ? "Choose a drink or shared surcharge to change its price."
                  : "Price changes are restricted to the booth lead."}
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
