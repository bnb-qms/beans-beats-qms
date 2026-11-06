"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { inputClass, requestJson } from "@/components/staff-workspace";
import { formatPrice } from "@/lib/format-price";
import {
  singaporeToday,
  validReportDate,
  type DailyTotals,
} from "@/lib/daily-totals";

export function DailyTotalsReport() {
  const [date, setDate] = useState(() => singaporeToday());
  const [refresh, setRefresh] = useState(0);
  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Capture the selected day and release the temporary download URL after use.
  async function downloadCsv() {
    const selectedDate = date;
    if (exporting || !validReportDate(selectedDate)) return;
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(
        `/api/report/csv?date=${encodeURIComponent(selectedDate)}`,
        { cache: "no-store" },
      );
      if (response.status === 401)
        window.dispatchEvent(new Event("staff-session-ended"));
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Cannot export sales. Try again.",
        );
      }
      const blob = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `beans-beats-sales-${selectedDate}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      if (mounted.current)
        setExportError(
          cause instanceof Error
            ? cause.message
            : "Cannot export sales. Try again.",
        );
    } finally {
      if (mounted.current) setExporting(false);
    }
  }

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
            disabled={exporting}
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
        <Button
          onClick={() => void downloadCsv()}
          disabled={exporting || !validReportDate(date)}
        >
          {exporting ? "Exporting CSV…" : "Export CSV"}
        </Button>
      </div>
      <p className="mt-4 text-muted">
        Cancelled orders appear in the CSV but are excluded from totals.
      </p>
      {exporting && (
        <p role="status" className="mt-4">
          Preparing CSV download…
        </p>
      )}
      {exportError && (
        <p role="alert" className="mt-4 text-error">
          {exportError}
        </p>
      )}
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
