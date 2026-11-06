# Tasks: F13 Daily Totals

Issue #11 · Owner Win · Planning branch `feat/13`

Read [plan](plan.md), [story map](spec.md), [contract](contracts/daily-totals.md), [data model](data-model.md) and [quickstart](quickstart.md). Both stories are P1 (source High priority). Cancelled orders are excluded by owner decision. Tests are included because `AGENTS.md` and `docs/building.md` require them for new logic and database functions.

## Phase 1: Setup

- [x] T001 Verify the issue branch against latest `main`, preserve existing work, and read `docs/README.md`, `docs/decisions.md`, `docs/building.md` and the installed Next.js guides named in `docs/plans/F13-daily-totals/plan.md`; retain `feat/13` if it is already the #11 branch rather than creating a second issue PR.
- [x] T002 Review and commit the planning artifacts in `docs/plans/F13-daily-totals/`, the clarified `docs/specs/F13-daily-totals.md` and `docs/decisions.md` with `Plan daily totals implementation` after formatting those files; stage only these paths.

## Phase 2: Foundation

- [x] T003 Add focused date-helper tests in `src/lib/daily-totals.test.ts` for the constraint "Required real calendar date in YYYY-MM-DD, years 0001–9999", including invalid calendar days, leap years, year zero, and Singapore default-date boundaries independent of device timezone.
- [x] T004 Implement the minimal shared response type and date helpers in `src/lib/daily-totals.ts` used by route/UI; enforce "Required real calendar date in YYYY-MM-DD, years 0001–9999" without silently normalizing bad dates; document `cups` as "Nonnegative safe integer; zero for no matching orders" and `sales_cents` as "Nonnegative safe integer in SGD cents; zero for no matching orders".
- [x] T005 Run the focused helper tests, inspect the diff, and commit only `src/lib/daily-totals.ts` and `src/lib/daily-totals.test.ts` with `Add daily report date validation`.

## Phase 3: US1 — Daily cups (P1, source story 31)

Goal: admin selects a Singapore date and sees correct cups for all non-cancelled orders. Independent test: mixed-status and multi-line fixtures give the expected cups, empty/cancelled-only days give zero, and unauthorized callers cannot read them.

The shared RPC/response includes both aggregate fields now to avoid changing its shape in US2; US2 independently verifies revenue rules and completes the sales display.

- [ ] T006 [P] [US1] Create rollback assertions in `supabase/tests/report_daily_totals.sql` for active admin access, inactive/missing staff and barista/counter denial, null date, denied public/anon/authenticated execution, empty/cancelled-only dates, all non-cancelled statuses, multiple quantities, Singapore midnight, later collection and retained previous-day records; use transaction-local fixtures like `supabase/tests/counter_prices.sql`.
- [ ] T007 [P] [US1] Create route tests in `src/app/api/report/daily-totals/route.test.ts`, mocking staff-server/RPC boundaries, for 401/403/400/503, missing/duplicate/malformed dates, correct server-supplied staff ID, no-store success/error responses, and unsafe or malformed aggregate response rejection; verify rejected requests never invoke the report RPC.
- [ ] T008 [US1] Add a new timestamped `supabase/migrations/<timestamp>_report_daily_totals.sql` (choose the actual unique timestamp at implementation) defining the contract's read-only RPC with "Required server-supplied UUID identifying an active admin" and "Required non-null date"; validate date range 0001–9999, use a fixed empty search path, schema-qualified names and service_role-only grants; aggregate quantities and recorded order totals separately in one statement over identical non-cancelled Singapore creation-time bounds, returning zero instead of null and converting numeric SGD to integer cents without joining current prices.
- [ ] T009 [US1] Implement GET in `src/app/api/report/daily-totals/route.ts` using `requireStaff`, an admin check, strict unique date validation, `database().rpc`, `json` and `failure`; supply session staff ID, map BB_FORBIDDEN/BB_INVALID to 403/400, validate "Nonnegative safe integer; zero for no matching orders" for cups and "Nonnegative safe integer in SGD cents; zero for no matching orders" for sales_cents, and map unavailable/unexpected data to 503 without exposing internals.
- [ ] T010 [US1] Replace `src/app/report/page.tsx` with `StaffWorkspace` and create `src/app/report/daily-totals.tsx` for admin-only date selection and cups; use `requestJson`, `inputClass`, `Button` and design tokens, Singapore today default, labelled controls, loading/error/retry states, no stale totals during transitions and cleanup that ignores late responses after date changes/unmount; let existing 401 handling restore sign-in.
- [ ] T011 [US1] Add an admin-only `/report` link in `src/components/staff-workspace.tsx`, preserving existing links and sign-in/sign-out behavior; non-admin page visits show denial without fetching report data.
- [ ] T012 [US1] Run US1 route/helper tests and `supabase/tests/report_daily_totals.sql` on a disposable database; follow cups/access/date/race scenarios in `docs/plans/F13-daily-totals/quickstart.md`, record actual results there and fix failures before committing.
- [ ] T013 [US1] Inspect and stage the migration, SQL/route tests, API and report UI plus `src/components/staff-workspace.tsx` and validation notes; commit this working increment with `Add admin daily cup totals` (do not stage unrelated files).

## Phase 4: US2 — Recorded sales in SGD (P1, source story 32)

Goal: use the same selected date to reconcile recorded revenue, including option charges. Independent test: 2 × (S$8 + S$1) and 1 × S$5 yields 3 cups/S$23.00; cancellation is excluded, menu edits and collection on another day do not change recorded revenue.

- [ ] T014 [P] [US2] Extend `supabase/tests/report_daily_totals.sql` with exact revenue assertions for multi-line/multi-quantity orders with options, all non-cancelled states, cancelled-only/empty zero, duplicate submission retry, later collection, later menu/option price changes and deactivation, and next-day numbering/history preservation; verify totals count each order once and use snapshots.
- [ ] T015 [P] [US2] Add the sales total in `src/app/report/daily-totals.tsx` using existing `src/lib/format-price.ts` on integer `sales_cents`; render S$0.00 only after successful empty-day data and ensure cups/revenue belong to the same selected-date response.
- [ ] T016 [US2] Run revenue assertions in `supabase/tests/report_daily_totals.sql` and the SGD/history/price-change browser scenarios in `docs/plans/F13-daily-totals/quickstart.md`; correct any aggregation defect in the new unmerged report migration and record evidence (never edit an already-merged migration).
- [ ] T017 [US2] Inspect and stage `src/app/report/daily-totals.tsx`, `supabase/tests/report_daily_totals.sql`, any related report fix and validation notes; commit with `Show recorded daily sales in SGD` after targeted checks pass.

## Phase 5: Final validation and delivery

- [ ] T018 Review FR1–FR10 coverage against `docs/specs/F13-daily-totals.md` and record outcomes in `docs/plans/F13-daily-totals/quickstart.md`; explicitly distinguish tested day rollover from deferred real F19 reset integration, and verify report responses expose no personal data.
- [ ] T019 Update the F13 status in `docs/features.md` to reflect implementation/review accurately and document remaining deployment or F19 validation limits in `docs/plans/F13-daily-totals/quickstart.md`; do not mark F14/F19 complete.
- [ ] T020 Run all scripts required by `package.json`/`README.md`: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`; run the report SQL assertions separately since npm tests do not execute SQL; resolve failures, rerun affected checks and record results in `docs/plans/F13-daily-totals/quickstart.md`.
- [ ] T021 Inspect `git diff --check` and the staged diff; commit remaining documentation and fixes in `docs/features.md`, `docs/plans/F13-daily-totals/quickstart.md` and explicitly selected affected paths with `Document daily totals validation` (use a separate descriptive imperative commit if substantive code fixes remain).
- [ ] T022 Follow `README.md`: push the issue branch only after required checks pass, open/update one PR into `main` with `Closes #11`, describe the cancelled-order decision, validation and integration limits, request Henry/Win review, move the issue to In Review, and verify CI is green before declaring merge-ready; do not merge as part of this task list.

## Dependencies and parallel examples

`T001 → T002 → T003 → T004 → T005 → US1 → US2 → T018–T022`.

Within US1, T006 (SQL tests) and T007 (route tests) can run in parallel after foundation. T008 follows the SQL expectations; T009 follows contract tests and RPC implementation. T010–T011 integrate the endpoint, then T012 validates before T013 commits. Keep edits to shared files sequential.

Within US2, T014 (SQL revenue tests) and T015 (sales presentation) can run in parallel after US1. Both finish before T016 and T017. Commit, push and integration validation steps are always sequential.

## Implementation and commit strategy

MVP: foundation + US1, yielding a secured working date/cups report and stable response contract. Deliver US2 next to complete F13; MVP alone does not meet the whole feature request. Avoid speculative CSV/reset abstractions.

At each commit checkpoint, use `git add <explicit paths>`, `git diff --cached --check`, review `git diff --cached`, then `git commit -m '<subject above>'`. Commit subjects must be imperative, capitalised, at most 72 characters, without a final full stop. Do not use conventional-commit prefixes. Never commit secrets, generated build files or unrelated changes. Do not create empty checkpoint commits when prior work already exists; verify and record their existing commit instead. All five checks are mandatory before any push, even if targeted checks passed earlier.

Count: 22 tasks — setup 2, foundation 3, US1 8, US2 4, final delivery 5. Four tasks marked parallelizable in two independent pairs. All story tasks carry a story label and every task names affected files or the governing workflow path.
