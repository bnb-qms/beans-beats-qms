# CSV export contract

## HTTP

`GET /api/report/csv?date=YYYY-MM-DD`

Only an authenticated active admin may export. The server obtains staff ID from `requireStaff`; no request-supplied identity is accepted. Exactly one valid date is required. One RPC call: `report_csv_export(p_staff_id, p_date)` returns the [data model](../data-model.md).

Success: 200; `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment; filename="beans-beats-sales-YYYY-MM-DD.csv"`; `Cache-Control: no-store`. Filename uses only the validated selected date.

Failures: JSON `{ error: string }` through existing `failure`, no-store and no attachment header. 401 missing/expired session; 403 non-admin or BB_FORBIDDEN; 400 invalid/missing/duplicate date or BB_INVALID; 503 unavailable configuration/database or malformed export payload. Do not disclose SQL internals. Reject bad request/auth before calling export RPC. Validate the response date, fields and numeric constraints before returning CSV; never download a partial file.

## CSV layout

Exactly ten columns in this order:

`order_id,pickup_number,created_at_singapore,status,drink_name,quantity,base_price_sgd,option_charges_sgd,unit_total_sgd,line_total_sgd`

One detail row per order line. Singapore timestamp is ISO-style local time with explicit `+08:00`. Status is the recorded value except cancelled rows display `cancelled (excluded from totals)`. Base and option charges are per cup. Option cell is a semicolon-separated list of snapshot name and two-decimal amount (for example `Iced: 1.00; Oat milk: 1.00`); empty when none. Numeric money cells have two decimal places without currency symbols or grouping separators.

After detail rows append exactly one ten-column summary row. `drink_name` contains `TOTAL (excluding cancelled orders)`, `quantity` contains daily cups, and `line_total_sgd` contains daily sales; the other seven cells are empty. Empty days still produce headers and this zero summary. This summary format needs no extra unapproved column. All rows have ten cells.

Encode UTF-8 with a BOM, CRLF row endings and a final CRLF. Quote every cell and double embedded quotes; preserve commas and line breaks within quoted cells. For textual cells, prefix an apostrophe if the value begins with tab/CR/LF or its first non-whitespace character is `=`, `+`, `-` or `@`. Apply protection to the final composed text cell, including option descriptions, before CSV quoting. Do not apply textual protection to generated numeric fields. Tests must prove formula-like names are imported as text.

## Database and UI

RPC is stable/read-only, security definer, empty search path, schema-qualified objects, active-admin checked, execute revoked from PUBLIC/anon/authenticated and granted to service_role only. Detail and totals share one statement snapshot. No arbitrary row cap or silent truncation.

UI reuses `/report` selected date and Button, disables export for invalid dates or while exporting, and disables date changes during export. Capture date for request and filename. Use no-store fetch, dispatch `staff-session-ended` on 401, parse safe JSON error messages, and never create a download on failure. Show progress with role=status and errors with role=alert. Clean up temporary links/object URLs and ignore completion after unmount. Preserve F13 totals, refresh behavior and admin wrapper. Explain that cancelled rows are included but excluded from totals.

A refreshed F13 report and CSV must agree for identical database state. New submissions/cancellations between separate requests may change totals; do not promise cross-request transactional consistency.
