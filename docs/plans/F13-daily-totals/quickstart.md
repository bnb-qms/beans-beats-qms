# F13 validation guide

These steps apply after implementation. Planning alone does not make the endpoint available.

## Prerequisites

Node 22+, installed dependencies (`npm ci`), `.env.local` configured from `.env.example` with staff session secret and Supabase server key, a disposable Postgres/Supabase database with all migrations in order, and active admin/barista/counter plus inactive staff test accounts. Never paste secrets into test logs or commit them. Reconcile hosted migration history before any remote migration; use a disposable database for this validation.

Apply the new migration using the repository's migration workflow. Run its rollback test with a locally configured test connection:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/report_daily_totals.sql
npm test -- src/lib/daily-totals.test.ts src/app/api/report/daily-totals/route.test.ts
npm run dev
```

## Scenarios

1. Open `/report` signed out; sign in as admin. Verify report link, default Singapore date, and keyboard-accessible date/refresh controls. Non-admins cannot read the route directly; inactive/expired sessions return 401.
2. Test isolated date fixtures: two lattes at S$8 each with S$1 iced each, plus one S$5 drink = 3 cups / S$23.00. Add cancelled lines: totals unchanged. Exercise queued, preparing, ready and collected statuses, including uncollected orders.
3. Select a fixture-free date: 0 cups / S$0.00. Multiple lines and options must not duplicate order revenue. Repeated idempotent submission must not duplicate stored orders or totals.
4. Place orders immediately before and at Singapore midnight; verify adjacent dates (UTC boundary 16:00). Collect yesterday's order today; yesterday retains its cups/revenue. A browser set to a different timezone still defaults to Singapore today.
5. Edit menu and option prices; yesterday's recorded totals remain unchanged. Add next-day records and restart pickup numbering; previous-day report remains queryable. When F19 is implemented, repeat through its actual reset UI and record the result separately.
6. Rapidly change dates with throttled requests: only the latest selected date's results appear. Disconnect or force an RPC failure: show an error and retry, never fabricated zero totals. Expire session then refresh: sign-in reappears.
7. Validate malformed/missing/duplicate dates, leap-day rules, authorization checks and safe integer response handling with automated tests; assert RPC privileges and rollback fixture cleanup in SQL.

## Release checks and evidence

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Record commands, outcomes and browser scenarios in the PR for #11. Run all five before push. State any unrun SQL/browser/reset checks explicitly; do not claim F19 integration passed before it exists. See [contract](contracts/daily-totals.md) for HTTP expectations and [tasks](tasks.md) for commit checkpoints.

## Implementation verification (6 Nov 2026)

- `npm run lint`: passed.
- `npm run format:check`: rerun after formatting task markers.
- `npm run typecheck`: passed.
- `npm test`: 26 tests passed.
- `npm run build`: blocked by Turbopack local port binding (`Operation not permitted`), also after escalation. `npm run build -- --webpack` passed.
- SQL rollback assertions: passed on 7 Nov 2026 in disposable local PostgreSQL `bb_f13_validation` after applying all migrations with Supabase role/auth shims.
- Browser `/report` sign-in state: verified on 7 Nov 2026 with the local dev server. Signed-in totals could not be exercised because no admin test login is configured. F19 reset integration remains unavailable because F19 is not implemented.

Recheck on 7 Nov 2026: lint, format, typecheck, all 26 Vitest tests and webpack build passed. The default Turbopack build remains blocked by local process port binding.
