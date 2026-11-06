# F14 data model

No tables or state transitions are added. Export is a read-only projection of `orders` → `order_items` → `order_item_add_ons`.

## Request

- `p_staff_id`: Required server-supplied UUID identifying an active admin.
- `p_date` / query `date`: Required real calendar date in YYYY-MM-DD, years 0001–9999; exactly one query value. Reuse `validReportDate`; SQL rejects null/out-of-range dates.

## RPC response

`{ date, lines, cups, sales_cents }`. `lines` is always an array, including on empty days. No extra database fields enter CSV output.

Each line has:

- `order_id`: Required UUID from the submitted order.
- `order_number`: Positive safe integer; pickup number can repeat on different days.
- `created_at`: Valid timestamp with timezone; CSV renders Singapore time with explicit +08:00 offset.
- `status`: Exactly queued, preparing, ready, collected or cancelled.
- `drink_name`: Required string from order_items.menu_item_name; preserve snapshot text, subject to CSV escaping and formula protection.
- `quantity`: Positive safe integer.
- `base_price_cents`: Nonnegative safe integer in SGD cents.
- `options`: Array of `{ name, price_cents }`, including an empty array for no options; name is a required snapshot string, price_cents is a nonnegative safe integer in SGD cents. Sort by snapshot add-on name then add-on row ID in SQL.
- `unit_total_cents`, `line_total_cents`: Nonnegative safe integers in SGD cents; unit total equals base plus options, line total equals quantity times unit total. Reject overflow or inconsistent arithmetic at the API boundary.

`cups`: Nonnegative safe integer; sum non-cancelled quantities, zero for empty/cancelled-only day.
`sales_cents`: Nonnegative safe integer in SGD cents; sum each non-cancelled orders.total_amount once, zero for empty/cancelled-only day. Match F13 rather than summing duplicated joined order amounts.

All money arithmetic starts in Postgres numeric and converts to integer cents before JSON. Preserve cancelled detail amounts; never zero or erase them. Filter on creation timestamp, not event_day, current open day, collection time or menu availability. Stable line order: created_at, order ID, item ID. Internal item IDs may order SQL results but are not exported columns. No names, mobile numbers, consent timestamps, staff identities or request payloads are returned.
