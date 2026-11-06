# F13 data model

No schema/table changes; one read-only function.

## Existing entities

- `staff`: UUID id, role (`admin`, `barista`, `counter`), active flag. Only an existing active admin may read totals.
- `orders`: UUID id; `created_at` timestamptz; `event_day` date; status; `total_amount` numeric(10,2), nonnegative. Source monetary snapshot includes selected options. Status transitions remain owned by queue features.
- `order_items`: order foreign key, positive integer quantity, nonnegative snapshot unit price. One order has many lines; cups equal summed quantity, not line count.
- `order_item_add_ons`: line foreign key and price snapshot. Already included in order totals; do not join these into revenue aggregation.

Existing constraints are unchanged; no new entity-write validation is introduced.

## New report contract constraints

- `date`: "Required real calendar date in YYYY-MM-DD, years 0001–9999". Reject blank, duplicate or malformed date parameters; date selection is not restricted to the event window.
- `cups`: "Nonnegative safe integer; zero for no matching orders".
- `sales_cents`: "Nonnegative safe integer in SGD cents; zero for no matching orders".
- `p_staff_id`: "Required server-supplied UUID identifying an active admin".
- `p_date`: "Required non-null date".

A response is an ephemeral projection, not stored data. The filter is `created_at >= Singapore midnight(date)` and `< Singapore midnight(date + 1)`, with `status <> 'cancelled'`. Both aggregates use the same snapshot/query. Only these aggregate fields and date leave the server; no customer names, phones or order identifiers.
