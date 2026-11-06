import { validReportDate } from "./daily-totals";

type Option = { name: string; price_cents: number };
type Line = {
  order_id: string;
  order_number: number;
  created_at: string;
  status: "queued" | "preparing" | "ready" | "collected" | "cancelled";
  drink_name: string;
  quantity: number;
  base_price_cents: number;
  options: Option[];
  unit_total_cents: number;
  line_total_cents: number;
};
type Export = {
  date: string;
  lines: Line[];
  cups: number;
  sales_cents: number;
};
const money = (value: number) => (value / 100).toFixed(2);
const integer = (value: unknown, positive = false) =>
  Number.isSafeInteger(value) &&
  (positive ? (value as number) > 0 : (value as number) >= 0);
const text = (value: unknown) => typeof value === "string" && value.length > 0;
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const statuses = ["queued", "preparing", "ready", "collected", "cancelled"];

// Reject malformed RPC results before creating an attachment.
export function validateCsvExport(value: unknown, date: string): Export {
  if (!value || typeof value !== "object") throw new Error("Invalid export");
  const data = value as Export;
  if (
    data.date !== date ||
    !validReportDate(data.date) ||
    !Array.isArray(data.lines) ||
    !integer(data.cups) ||
    !integer(data.sales_cents)
  )
    throw new Error("Invalid export");
  for (const line of data.lines) {
    if (
      !line ||
      !uuid(line.order_id) ||
      !integer(line.order_number, true) ||
      !text(line.drink_name) ||
      !integer(line.quantity, true) ||
      !integer(line.base_price_cents) ||
      !integer(line.unit_total_cents) ||
      !integer(line.line_total_cents) ||
      !statuses.includes(line.status) ||
      !Array.isArray(line.options)
    )
      throw new Error("Invalid export line");
    const timestamp = new Date(line.created_at);
    if (
      typeof line.created_at !== "string" ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(line.created_at) ||
      !Number.isFinite(timestamp.getTime()) ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(timestamp) !== date
    )
      throw new Error("Invalid export date");
    let unit = line.base_price_cents;
    for (const option of line.options) {
      if (!option || !text(option.name) || !integer(option.price_cents))
        throw new Error("Invalid option");
      unit += option.price_cents;
    }
    if (
      !Number.isSafeInteger(unit) ||
      unit !== line.unit_total_cents ||
      !Number.isSafeInteger(unit * line.quantity) ||
      unit * line.quantity !== line.line_total_cents
    )
      throw new Error("Invalid line amount");
  }
  return data;
}

// Quote all cells and protect user-supplied text from spreadsheet formulas.
function cell(value: string, textual = false) {
  const safe =
    textual &&
    (/^[\t\r\n]/.test(value) || /^[\s\u0000-\u001f]*[=+\-@]/.test(value))
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function formatCsvExport(data: Export): string {
  const rows = [
    [
      "order_id",
      "pickup_number",
      "created_at_singapore",
      "status",
      "drink_name",
      "quantity",
      "base_price_sgd",
      "option_charges_sgd",
      "unit_total_sgd",
      "line_total_sgd",
    ].map((v) => cell(v)),
  ];
  for (const line of data.lines) {
    const singapore = new Date(
      new Date(line.created_at).getTime() + 8 * 3600000,
    )
      .toISOString()
      .replace("Z", "+08:00");
    rows.push([
      cell(line.order_id, true),
      cell(String(line.order_number)),
      cell(singapore),
      cell(
        line.status === "cancelled"
          ? "cancelled (excluded from totals)"
          : line.status,
        true,
      ),
      cell(line.drink_name, true),
      cell(String(line.quantity)),
      cell(money(line.base_price_cents)),
      cell(
        line.options
          .map((option) => `${option.name}: ${money(option.price_cents)}`)
          .join("; "),
        true,
      ),
      cell(money(line.unit_total_cents)),
      cell(money(line.line_total_cents)),
    ]);
  }
  rows.push(
    [
      "",
      "",
      "",
      "",
      "TOTAL (excluding cancelled orders)",
      String(data.cups),
      "",
      "",
      "",
      money(data.sales_cents),
    ].map((value, index) => cell(value, index === 4)),
  );
  return "\uFEFF" + rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}
