"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { inputClass, requestJson } from "@/components/staff-workspace";
import { formatPrice } from "@/lib/format-price";
import { singaporeToday, type DailyTotals } from "@/lib/daily-totals";

export function DailyTotalsReport() {
  const [date, setDate] = useState(() => singaporeToday());
  const [refresh, setRefresh] = useState(0);
  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Ignore old responses after a date change or screen exit.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setTotals(null);
      setError("");
      setLoading(true);
      void requestJson<DailyTotals>(
        `/api/report/daily-totals?date=${encodeURIComponent(date)}`,
      )
        .then((value) => {
          if (current) setTotals(value);
        })
        .catch((cause: unknown) => {
          if (current)
            setError(
              cause instanceof Error
                ? cause.message
                : "Cannot load daily totals.",
            );
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [date, refresh]);

  return (
    <div className="max-w-2xl py-8">
      <p className="eyebrow">Daily sales report</p>
      <h1 className="headline mt-2">Daily totals</h1>
      <div className="mt-8 flex flex-wrap items-end gap-4">
        <label className="grid gap-2 font-bold">
          Event date
          <input
            className={inputClass}
            type="date"
            value={date}
            onChange={(event) => {
              setTotals(null);
              setDate(event.target.value);
            }}
            required
          />
        </label>
        <Button
          onClick={() => {
            setTotals(null);
            setRefresh((value) => value + 1);
          }}
        >
          Refresh totals
        </Button>
      </div>
      {loading && (
        <p className="mt-6" role="status">
          Loading daily totals…
        </p>
      )}
      {error && (
        <p className="mt-6 text-error" role="alert">
          {error}
        </p>
      )}
      {totals && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-live="polite">
          <section className="bg-panel p-6">
            <h2 className="eyebrow">Cups sold</h2>
            <p className="numeral mt-2 text-4xl">{totals.cups}</p>
          </section>
          <section className="bg-panel p-6">
            <h2 className="eyebrow">Recorded sales</h2>
            <p className="numeral mt-2 text-4xl">
              {formatPrice(totals.sales_cents)}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
