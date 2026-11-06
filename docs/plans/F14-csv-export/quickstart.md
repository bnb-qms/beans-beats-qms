# F14 implementation validation guide

Status: implementation in progress. Focused CSV tests, lint, formatting, typecheck and full Vitest suite passed on 7 Nov 2026. `npx next build --webpack` passed; default `npm run build` failed because Turbopack could not bind a local worker port (Operation not permitted), including on escalation. SQL assertions have not run: no disposable Postgres is running (`pg_isready` reports no response). Manual browser and spreadsheet scenarios have not run. F19 reset integration remains deferred.

## Prerequisites

Node 22+, installed dependencies (`npm ci` if needed), environment from `.env.example`, active admin and barista test accounts, and a disposable database with existing migrations including F13 and the new F14 migration applied in order. Use trusted local credentials, never production seed fixtures. Follow `README.md` for database setup; reconcile hosted migration history before any remote migration command. Discover installed Supabase CLI commands with `--help` before use.

## Automated checks after building

```bash
npx vitest run src/lib/csv-export.test.ts src/app/api/report/csv/route.test.ts
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/report_csv_export.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/report_daily_totals.sql
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Set `TEST_DATABASE_URL` only to the disposable database. SQL tests must use transaction/rollback fixtures. npm tests do not run SQL. Record actual outcomes and unavailable checks; never mark a task complete based on an unexecuted command. Fix failures and repeat affected checks before committing; all five repository checks must pass before pushing.

## End-to-end scenarios

Run `npm run dev` and open `/report`.

1. Sign in as admin and select the SQL fixture date. Export non-cancelled 2 × (8.00 + 1.00) and 1 × 5.00 plus a cancelled 6.00 line. Confirm all three detail rows, cancelled annotation, and 3 cups / 23.00 summary matching refreshed F13. Check multiple lines and multiple options never duplicate quantities or sales.
2. Select empty and cancelled-only dates: valid CSV downloads with zero summary; cancelled-only date retains its detail rows. Check filename/date and all ten columns against [contract](contracts/csv-export.md).
3. Verify all five statuses, exact Singapore midnight boundaries, later collection, and dates where event_day differs from creation day. Export an older date after day rollover; when F19 is available repeat after its real reset. If unavailable, explicitly record that integration as deferred.
4. Change current menu and option prices or deactivate them in the disposable database. Re-export: recorded names and prices stay unchanged. Confirm order/item/add-on rows, versions, timestamps and counters are unchanged by the export itself.
5. Open CSV in an available common spreadsheet application and record app/version. Verify Unicode, commas, quotes, multiline and formula-like names, decimal amounts and summary alignment. Do not claim compatibility for applications not checked.
6. Sign out, expire the session, use a barista account and deactivate an admin. Verify appropriate 401/403, sign-in restoration on 401, and no downloaded error file or customer personal fields. Directly exercise malformed/missing/duplicate dates and unavailable database paths through route tests.
7. Throttle the request, attempt a date change/repeated export, navigate away, and simulate network failure. Confirm disabled controls, captured date, loading/error announcements, retry and no late download/object URL leak.
8. Export a realistic peak-day fixture including more than 1,000 lines; verify exact row count, footer totals and usable response time without truncation. Record measured size/time; do not introduce streaming without evidence.

## Commit and delivery evidence

Follow checkpoints in [tasks](tasks.md). Record commands/results, SQL database type, manual scenarios, application used, any unavailable checks and final build result here. Use imperative, capitalised SE-EDU subjects, at most 72 characters, no full stop. Stage explicit feature paths only. Push only after required checks pass; one PR into main with `Closes #12`; CI green before merge-ready.
