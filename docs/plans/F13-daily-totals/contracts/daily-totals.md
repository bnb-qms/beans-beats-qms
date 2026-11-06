# Daily totals contract

## HTTP

`GET /api/report/daily-totals?date=2026-11-26`

Requires existing staff session cookie and active admin role. No client staff ID/role is trusted. Date is required, unique, exactly YYYY-MM-DD and a real date, years 0001–9999. Reject normalized invalid dates such as 2026-02-30. No request body.

Success, HTTP 200, `Cache-Control: no-store`:

```json
{ "date": "2026-11-26", "cups": 3, "sales_cents": 2300 }
```

An empty day returns the same shape with both numbers zero. Validate aggregate values as nonnegative safe integers before serialization; do not silently round unsafe values.

Errors use existing `{ "error": "Plain recovery message" }` shape: 401 missing/expired/inactive session; 403 signed-in non-admin or `BB_FORBIDDEN`; 400 invalid date or `BB_INVALID`; 503 unconfigured/unavailable database, unexpected result or unsafe numeric response. Authenticate before querying. Keep `json()` and `failure()` no-store behavior. A GET needs no write-origin check.

## Database

New `public.report_daily_totals(p_staff_id uuid, p_date date)` returns one JSONB object with the HTTP success fields. Use `security definer set search_path = ''`, schema-qualified tables, active admin check raising `BB_FORBIDDEN`, and null/out-of-range date check raising `BB_INVALID`. Revoke execution from PUBLIC, anon and authenticated; grant only service_role. Do not enable `daily_sales`.

Count non-cancelled orders created during the requested Singapore date. Sum quantities separately from order monetary totals; SQL numeric sum times 100 yields cents. One SQL query/snapshot supplies both totals. No mutations.

## Screen

`/report` uses `StaffWorkspace`. Signed-out users see sign-in; signed-in non-admins see an access-denied message without fetching totals. Admins see a labelled date input, refresh control, cups and SGD total (`formatPrice`). Default date is today in Asia/Singapore regardless of device timezone. Clear old results during selection changes, prevent old requests from overwriting newer selections, expose loading/error feedback accessibly, and provide retry. Session expiry returns to workspace sign-in. Genuine empty success reads `0` cups and `S$0.00`; failures never look like zero sales.
