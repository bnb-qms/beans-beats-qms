import { describe, expect, it } from "vitest";
import { formatCsvExport, validateCsvExport } from "./csv-export";

const date = "2026-11-26";
const line = {
  order_id: "11111111-1111-4111-8111-111111111111",
  order_number: 1,
  created_at: "2026-11-25T16:00:00Z",
  status: "cancelled",
  drink_name: "=SUM(1,2)\nLatte",
  quantity: 1,
  base_price_cents: 800,
  options: [{ name: "+Iced", price_cents: 100 }],
  unit_total_cents: 900,
  line_total_cents: 900,
};
describe("CSV export", () => {
  it("formats cancellation, Unicode safe cells, BOM, CRLF and zero totals", () => {
    const csv = formatCsvExport(
      validateCsvExport({ date, lines: [line], cups: 0, sales_cents: 0 }, date),
    );
    expect(csv.startsWith('\uFEFF"order_id","pickup_number"')).toBe(true);
    expect(csv).toContain('"cancelled (excluded from totals)"');
    expect(csv).toContain('"\'=SUM(1,2)\nLatte"');
    expect(csv).toContain('"\'+Iced: 1.00"');
    expect(csv).toContain('"9.00"');
    expect(csv).toContain('"TOTAL (excluding cancelled orders)","0"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("rejects inconsistent, unsafe and wrong-day payloads", () => {
    const payload = { date, lines: [line], cups: 0, sales_cents: 0 };
    expect(() =>
      validateCsvExport({ ...payload, date: "2026-11-27" }, date),
    ).toThrow();
    expect(() =>
      validateCsvExport(
        { ...payload, lines: [{ ...line, line_total_cents: 1 }] },
        date,
      ),
    ).toThrow();
    expect(() =>
      validateCsvExport(
        { ...payload, cups: Number.MAX_SAFE_INTEGER + 1 },
        date,
      ),
    ).toThrow();
    expect(() =>
      validateCsvExport(
        {
          ...payload,
          lines: [{ ...line, created_at: "2026-11-26T16:00:00Z" }],
        },
        date,
      ),
    ).toThrow();
  });
});
