# Tasks: F14 CSV Export

Issue #12 · Owner Win · Planning branch `feat/14`

Read [plan](plan.md), [story map](spec.md), [data model](data-model.md), [contract](contracts/csv-export.md) and [quickstart](quickstart.md). One P1 story (source story 33). Tests are explicitly requested by the user and required for new logic/database functions by repository instructions. These tasks describe future implementation; none has been executed by writing this plan.

## Phase 1: Setup

- [ ] T001 Verify `feat/14` is the issue #12 branch and reconcile with latest main without discarding work; read `docs/README.md`, `docs/decisions.md`, `docs/building.md`, `AGENTS.md` and the installed Next.js guides listed in `docs/plans/F14-csv-export/plan.md`; retain one branch/PR for this issue.
- [x] T002 Review and format `docs/plans/F14-csv-export/`, `docs/specs/F14-csv-export.md`, `docs/decisions.md` and `docs/features.md`; stage only planning changes and commit with `Plan daily sales CSV export`.

## Phase 2: Foundation

No new app setup, package, table or shared request abstraction is needed.

- [ ] T003 Trace existing callers of `src/app/report/daily-totals.tsx`, `src/lib/daily-totals.ts` and `src/components/staff-workspace.tsx`; verify F13 migration is available and inspect snapshot writes in `supabase/migrations/20261106010000_counter_orders.sql`; prepare a disposable migrated database for `supabase/tests/report_csv_export.sql`, recording setup limitations in `docs/plans/F14-csv-export/quickstart.md`.

## Phase 3: US1 — Download selected-day sales (P1 / story 33)

Goal: active admin downloads all selected-date order lines with recorded prices, no personal data and F13-compatible totals. Independent test: non-cancelled 2 × (8.00 + 1.00) and 1 × 5.00 plus cancelled 6.00 exports three rows, explicitly marks cancellation and totals 3 cups / 23.00. Unauthorized callers cannot download; history and snapshots remain unchanged.

### Tests and implementation

- [ ] T004 [P] [US1] Add transaction/rollback assertions in `supabase/tests/report_csv_export.sql` for active admin only, missing/inactive/non-admin denial, null/out-of-range dates, denied PUBLIC/anon/authenticated execute, all statuses including cancelled detail, empty/cancelled-only zero totals, multi-line/multi-option quantities, exact Singapore boundaries, mismatched event_day, historical rollover, snapshot prices after menu changes, more than 1,000 lines without truncation, read-only before/after comparisons and parity with `report_daily_totals` in the same database state.
- [ ] T005 [P] [US1] Add formatter/validation tests in `src/lib/csv-export.test.ts` for exact ten-column header and summary, BOM/CRLF, Unicode, commas/quotes/newlines, formula-like text including whitespace/control prefixes and composed option cells, deterministic options, two-decimal money, cancelled annotation with retained amounts, empty data, malformed payloads, date mismatch, overflow and inconsistent line arithmetic; use the approved layout in `docs/plans/F14-csv-export/contracts/csv-export.md`.
- [ ] T006 [P] [US1] Add tests in `src/app/api/report/csv/route.test.ts` for 401/403/400/503, missing/duplicate/invalid dates, server-supplied staff identity, BB_FORBIDDEN/BB_INVALID mapping, malformed RPC data, no-store success/errors, exact CSV attachment filename/content type, no attachment on JSON errors and no RPC invocation on rejected auth/input; prove PII is never serialized.
- [x] T007 [US1] Create a new migration via the installed CLI's discovered migration-new command at `supabase/migrations/<timestamp>_report_csv_export.sql` (resolve the actual path when generated); define stable read-only `report_csv_export(p_staff_id uuid, p_date date)` with "Required server-supplied UUID identifying an active admin" and "Required real calendar date in YYYY-MM-DD, years 0001–9999"; reject null SQL date, use empty search path/schema-qualified objects, revoke PUBLIC/anon/authenticated and grant service_role only. Aggregate all lines and non-cancelled summary in one statement snapshot, filter created_at by Singapore midnight bounds, aggregate options before joining and sum recorded orders.total_amount once per order. Return scalar JSON and explicit snapshot fields only; no limits, writes, current-price joins or merged-migration edits.
- [x] T008 [US1] Implement the minimal response type, validation and formatter in `src/lib/csv-export.ts` against `docs/plans/F14-csv-export/data-model.md`: order_id "Required UUID from the submitted order"; order_number and quantity "Positive safe integer"; created_at "Valid timestamp with timezone"; status "Exactly queued, preparing, ready, collected or cancelled"; drink/option names required snapshot strings; options an array including empty; all monetary fields "Nonnegative safe integer in SGD cents"; cups "Nonnegative safe integer"; lines always an array and date equal to request. Validate safe unit/line arithmetic; render all ten contract columns, stable SQL ordering, cancelled annotation, numeric footer, formula-safe quoted text, BOM and CRLF without dependencies.
- [x] T009 [US1] Implement `src/app/api/report/csv/route.ts` with `requireStaff`, admin gate, reused `validReportDate`, exactly one date, trusted staff ID RPC argument, contract error mapping, payload validation and native CSV Response. Send no-store and validated filename attachment on success; use `failure` for JSON errors and never send partial CSV or personal data.
- [x] T010 [US1] Run focused tests in `src/lib/csv-export.test.ts` and `src/app/api/report/csv/route.test.ts`, then SQL assertions in `supabase/tests/report_csv_export.sql` and `supabase/tests/report_daily_totals.sql` on the disposable database; fix failures, record actual results in `docs/plans/F14-csv-export/quickstart.md`, inspect/stage only backend files and evidence, and commit with `Add secured daily sales CSV export` after checks pass.
- [x] T011 [US1] Add Export CSV handling to `src/app/report/daily-totals.tsx` using the existing selected date and Button; capture the date, disable invalid/repeated exports and date changes during download, show accessible progress/error messages and cancellation explanation, use no-store fetch, dispatch the existing staff-session-ended event on 401, parse safe JSON errors, download only successful CSV, clean up temporary link/object URL and ignore completion after unmount. Preserve `src/app/report/page.tsx` admin gating and F13 refresh behavior; do not change `requestJson` or other callers.
- [ ] T012 [US1] After building the UI, execute the admin/download/session-expiry/date-lock/unmount/network-failure and spreadsheet-import scenarios in `docs/plans/F14-csv-export/quickstart.md`; rerun focused tests, correct failures and record evidence, then inspect/stage `src/app/report/daily-totals.tsx` and validation notes and commit with `Add CSV download to daily reports`.

## Phase 4: Final validation and delivery

- [ ] T013 Check FR1–FR8 and all acceptance criteria in `docs/specs/F14-csv-export.md` against the implementation; execute remaining history/no-write/peak-volume scenarios in `docs/plans/F14-csv-export/quickstart.md`. Test actual F19 reset if available, otherwise explicitly record that integration as deferred rather than claiming it passed.
- [x] T014 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run build` as required by `package.json` and `README.md`; separately run `supabase/tests/report_csv_export.sql` and F13 SQL regression assertions. Fix failures, rerun affected checks and record actual results in `docs/plans/F14-csv-export/quickstart.md`; all five checks must pass before pushing.
- [x] T015 Update F14 implementation/review status accurately in `docs/features.md` and final evidence/limitations in `docs/plans/F14-csv-export/quickstart.md`; run formatting and `git diff --check`, review/stage only intended files and commit with `Document CSV export validation`. Give substantive fixes their own descriptive SE-EDU commit after relevant tests; never mark unavailable validation as complete.
- [ ] T016 Follow `README.md`: push the issue branch only after required checks pass, open/update one PR into main with `Closes #12`, document cancellation semantics and validation limits, request Henry/Win review, move issue to In Review and verify green CI before calling it merge-ready. Do not merge as part of this checklist.

## Dependencies and parallel examples

`T001 → T002 → T003 → (T004 ∥ T005 ∥ T006) → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016`.

US1 parallel opportunity: SQL fixture assertions (T004), CSV unit tests (T005) and route contract tests (T006) touch different files and can be authored together after foundation. All three use the fixed contract. Keep shared implementation, integration validation and commits sequential. T007 follows database expectations; T008 follows formatter expectations; T009 integrates both. If later fixes change checked code, rerun affected checks before delivery.

## Implementation and commit strategy

MVP is US1 end to end, including access checks, CSV safety, cancelled detail, reconciled summary and download UI. Backend-only T010 is a useful tested checkpoint but does not complete the user story. No second story or speculative streaming/customization feature is needed.

At each commit checkpoint: run the prescribed targeted checks after building the increment, resolve failures, `git add <explicit paths>`, `git diff --cached --check`, review `git diff --cached`, then commit. Subjects are imperative, capitalised, at most 72 characters and have no final full stop or conventional-commit prefix. Never stage secrets, generated artifacts or unrelated edits; skip empty checkpoint commits if verified work already exists. Tests are not deferred until after pushing. All five repository checks are mandatory before any push, with SQL tests run separately.

Count: 16 tasks — setup 2, foundation 1, US1 9, final validation/delivery 4. Three parallel test-authoring tasks. Every task has a checkbox, sequential ID and file path; every story task carries [US1].
