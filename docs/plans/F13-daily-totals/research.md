# F13 research decisions

## Authentication

Decision: reuse server staff cookies and introduce a service-only `p_staff_id` RPC checking an active admin. Rationale: `docs/building.md` forbids using the old Supabase-Auth-based `daily_sales`; `requireStaff()` already rechecks active status. Alternatives: browser table reads or enabling the old function would use the wrong authorization model.

## Status selection

Decision: exclude `cancelled`, include queued/preparing/ready/collected. Rationale: owner clarification on 6 Nov 2026 aligns with existing SQL and dependency notes. Alternative: count cancelled as the original F13 wording implied; explicitly rejected by owner. Update the source spec and decisions together.

## Dates and persistence

Decision: query Singapore creation-day boundaries, independently of operational queues and resets. Rationale: F13 FR7 specifies creation date; F1 assigns `event_day` using Singapore transaction time. Alternative: use only `event_day`, or collection date; creation timestamps directly enforce the requirement. No hardcoded 26–29 Nov date limit. Preserve source records; F13 performs no reset writes.

## Aggregation and money

Decision: sum item quantities and order totals separately over the same order set, convert numeric SGD total to integer cents in SQL and reuse `formatPrice`. Rationale: joining orders to lines/add-ons before summing order totals inflates revenue; live menu prices corrupt historical totals. Alternatives: browser aggregation and recomputation from live menu data add exposure and duplicate business logic.

## UI and testing

Decision: existing client staff workspace, date input, refresh button, two totals and explicit loading/error states. Use route/helper Vitest tests and rollback SQL assertions; browser validation covers presentation and rapid date changes. Rationale: these match repository patterns without a new testing dependency. No CSV, chart, realtime or offline-cache work.

## Evidence

Local sources: `src/lib/staff-server.ts`, `src/components/staff-workspace.tsx`, `src/lib/format-price.ts`, `src/app/report/page.tsx`, initial schema, counter-order migration, SQL price tests, `docs/building.md`, `docs/dependencies.md`, F13 and F19. Installed Next.js guide: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (GET routes are uncached by default; retain explicit no-store helper).

No unresolved F13 product decisions remain. The actual F19 reset flow remains an external validation dependency.
