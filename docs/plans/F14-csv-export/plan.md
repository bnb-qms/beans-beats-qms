# Implementation plan: F14 CSV Export

## Summary

Add an Export CSV button to the existing `/report` date picker and a secured download endpoint. Export one row per order line, including clearly marked cancelled orders, with snapshot prices and a summary excluding cancelled orders. No customer personal data. Issue #12, owner Win, planning branch `feat/14` (retained).

## Workflow adaptation

The repository has no `.specify/` directory, templates, constitution or extension hooks. Both requested Python setup scripts were attempted and fail because they do not exist. Follow the requested skills' phases under `docs/plans/F14-csv-export/`, matching F13, without installing spec-kit. Before/after plan and tasks hook checks find no extension file. Repository instructions supply the gates.

## Technical context

TypeScript, Next.js 16.4.3 App Router, React 19.3, Tailwind 4, Supabase/Postgres and Vitest 5. Reuse `validReportDate`, `StaffWorkspace`, `Button`, `requireStaff`, `database`, `HttpError` and `failure`. No dependency additions. Installed route-handler documentation confirms native Response support; read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `05-server-and-client-components.md` again before implementation.

## Scope and affected paths

- New `supabase/migrations/<timestamp>_report_csv_export.sql`: read-only `report_csv_export(p_staff_id uuid, p_date date)`; create a new timestamped migration at implementation, never edit merged migrations.
- New `supabase/tests/report_csv_export.sql`: rollback fixtures and assertions, including parity with existing F13 RPC.
- New `src/lib/csv-export.ts` and `src/lib/csv-export.test.ts`: minimal export shape, response validation and CSV formatting.
- New `src/app/api/report/csv/route.ts` and adjacent `route.test.ts`: session/admin/date validation, RPC, response validation and attachment response.
- Update `src/app/report/daily-totals.tsx`: selected-date export, progress, errors and download cleanup. Keep `src/app/report/page.tsx` admin wrapper unchanged.
- Update `docs/features.md`, `docs/specs/F14-csv-export.md`, `docs/decisions.md` and this planning directory as appropriate for implementation evidence.

Existing F13 API, staff helper callers and public RPCs keep their contracts. No new tables, public permissions, seed changes, config, barrel exports, jobs, offline export cache, reset implementation or general-purpose download framework.

## Design

See [research](research.md), [data model](data-model.md), [contract](contracts/csv-export.md), [validation guide](quickstart.md) and [tasks](tasks.md).

Use a stable, security-definer function with empty search path, schema-qualified objects, active-admin check and service-role-only execute grants, following the project's custom staff architecture. Read explicit snapshot columns only. Return a single JSON object containing all lines and totals, avoiding a paginated table RPC that could silently truncate the export. Use one statement snapshot for lines and summary. Filter by half-open Singapore midnight bounds on `created_at`, exactly as F13. Aggregate options per line before joining; sum each non-cancelled order's recorded `total_amount` once for sales and quantities for cups. Never join current menu prices.

Keep CSV generation on the server. Use integer cents through the JSON boundary, validate safe numeric values and serialize decimal SGD with two places. No partial file on error. Download in the existing report component using local fetch because `requestJson` only accepts JSON. Preserve its 401 session-ended event behavior. Capture the date at click, disable the date picker and export button during download, report errors inline, avoid downloads after unmount and revoke object URLs. Existing F13 display remains usable; mention that totals exclude cancelled orders. Refresh F13 before reconciliation if orders changed since the screen loaded.

## Repository gates

Pre-design: PASS after owner resolved cancellation semantics and columns on 7 Nov 2026. No remaining clarification marker.

Post-design: PASS. New migration only; trusted staff identity and database authorization; no PII or writes; existing tokens/components; focused TypeScript and SQL tests; SE-EDU commits; all five repository checks before pushing; one issue PR with `Closes #12` and green CI.

F19 is not implemented by this plan. Test retained previous-day history and rollover now; run the actual reset scenario when F19 is available, and report it as deferred until then. Full-day export is buffered in memory for the event-scale dataset; validate realistic peak volume before release, and only introduce streaming if measured limits require it.
