# Implementation plan: F13 Daily Totals

## Summary

Replace the `/report` placeholder with an admin-only date picker and two totals. Sum quantities from non-cancelled orders, and sum each recorded order total exactly once. Use Singapore creation dates and existing staff sessions. Owner confirmed cancelled orders are excluded on 6 Nov 2026.

Issue: #11. Planning checkout: `feat/13` (retained). Implement on this issue's branch, based on current `main`; do not discard local work or create a second PR for this issue.

## Workflow adaptation

This repository has no `.specify/` directory, setup scripts, templates, constitution or extension hooks. Both requested setup commands fail because their files are absent. Artifacts follow the skills' phase structure here without installing spec-kit or inventing a constitution. Before/after plan and tasks hook checks find no extension file. Repository `AGENTS.md`, `docs/decisions.md` and `docs/building.md` supply the gates.

## Technical context

TypeScript, Next.js 16.4.3 App Router, React 19.3, Tailwind 4, Supabase/Postgres, Vitest 5. Existing dependencies suffice. Read the installed Next.js route-handler and client-component guides before implementation. Reuse `StaffWorkspace`, `requestJson`, `Button`, `inputClass`, `requireStaff`, `database`, `json`, `failure` and `formatPrice` (integer cents).

No new table, materialized report, background job, public RPC, browser Supabase table read or dependency is needed. No CSV (F14), reset implementation (F19), per-drink breakdown, realtime subscription or offline report cache.

## Scope and affected files

- New timestamped `supabase/migrations/<timestamp>_report_daily_totals.sql`: `report_daily_totals(p_staff_id uuid, p_date date)`, restricted to service role, active admin check, read-only aggregates.
- New `supabase/tests/report_daily_totals.sql`: transaction/rollback assertions following existing SQL tests.
- New `src/app/api/report/daily-totals/route.ts` and adjacent `route.test.ts`: session/role/date validation, RPC call and error mapping.
- New `src/lib/daily-totals.ts` and adjacent test: shared response type and strict date validation/default Singapore day helper only as needed by route/UI.
- Replace `src/app/report/page.tsx`; add `src/app/report/daily-totals.tsx` using the existing staff-page pattern.
- `src/components/staff-workspace.tsx`: admin-only report navigation link; preserve sign-in/out and other links.
- `docs/features.md` and this planning directory: validation evidence and feature status when actually implemented.

Existing callers remain unchanged; the old disabled `daily_sales` stays disabled. Use new fixtures inside rollback SQL tests, not production seed changes. No shared barrel export or configuration change is required.

## Design

See [research](research.md), [data model](data-model.md), [contract](contracts/daily-totals.md) and [validation guide](quickstart.md).

Use `created_at` within the selected date's Singapore-midnight half-open interval. Existing F1 writes `event_day` and `created_at` from the same transaction time; tests verify midnight boundaries. Direct creation-time filtering keeps F13 FR7 true even for imported fixtures with inconsistent `event_day`. Do not filter by collection time or an active/open event day.

Aggregate sales independently of the item join to prevent duplicate revenue for multi-line orders. SQL does numeric money arithmetic and converts the result to integer cents. Return only date and aggregate numbers, with safe-number checks at the API boundary. Zero rows produce zero totals, never null.

Page defaults to today's Singapore date, supports any valid historical date, and fetches on selection and explicit refresh. Loading/errors are distinct from empty-day success; hide obsolete totals and ignore late responses after a date change or unmount. No automatic polling required.

## Constitution / repository checks

Pre-design: PASS after owner resolved cancellation conflict. No constitution exists; repository rules apply.

Post-design: PASS. Uses existing staff architecture and design tokens, a new migration with `p_staff_id`, service-role-only execution and active-admin checks. No destructive writes, PII response, changed order semantics, or privilege grants to browser roles. Tests cover new logic as required by repository instructions. Commit subjects are imperative, capitalised, no full stop, at most 72 characters. All five prescribed checks must pass before pushing, and PR uses `Closes #11` with green CI.

F19's reset UI is not implemented here. Validate history preservation across day rollover now; validate the real reset flow when F19 exists. This is an integration limitation, not permission to delete old orders.
