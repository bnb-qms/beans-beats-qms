"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { inputClass, requestJson } from "@/components/staff-workspace";
import { useMenu } from "@/components/use-menu";
import { cents, type Drink, type AddOn } from "@/lib/order";
import { formatPrice } from "@/lib/format-price";
import { parsePrice, type MenuChange } from "@/lib/menu-change";
import type { Staff } from "@/lib/staff-server";

type Entry = { kind: "drink" | "option"; item: Drink | AddOn };
export function MenuControls({ staff }: { staff: Staff }) {
  const { menu, connected, error, refresh } = useMenu();
  const [edit, setEdit] = useState<(MenuChange & { name: string }) | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const entries: Entry[] = menu
    ? [
        ...menu.drinks.map((item) => ({ kind: "drink" as const, item })),
        ...menu.addOns.map((item) => ({ kind: "option" as const, item })),
      ]
    : [];
  const current = entries.find((e) => e.item.id === edit?.id)?.item;
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
      void refresh().catch(() => {});
      setNotice(
        "Price saved. Connected order screens will use the new amount; past orders keep their recorded prices.",
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
                          {staff.role === "admin" && (
                            <Button
                              disabled={busy || !connected}
                              onClick={() => {
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
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
        <aside className="rule bg-panel p-6 lg:sticky lg:top-6 lg:self-start">
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
