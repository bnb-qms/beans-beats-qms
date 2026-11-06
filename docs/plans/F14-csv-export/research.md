# F14 research decisions

## Reporting semantics

Decision: include every submitted status in detail; mark cancelled rows and exclude them from summary. Use the ten owner-approved columns without personal data.
Rationale: owner clarification on 7 Nov 2026 reconciles F14 detail requirements with F13's non-cancelled totals.
Alternatives considered: omit cancelled rows; change F13 totals. Both rejected by owner.

## Data and security

Decision: add a service-role-only RPC using server-supplied staff ID and active-admin checks, following `supabase/migrations/20261106060000_report_daily_totals.sql` and `docs/building.md`.
Rationale: custom staff sessions are authoritative here. Existing disabled `daily_sales` uses a different login model. Snapshots in `order_items` and `order_item_add_ons` preserve prices; a single statement snapshot prevents concurrent status changes splitting detail and totals. Return a scalar JSON aggregate to avoid row pagination truncation.
Alternatives considered: direct client table reads, re-enable legacy RPC, separate detail and total HTTP calls. Rejected for authorization or consistency risks.

[Supabase database function guidance](https://supabase.com/docs/guides/database/functions) was consulted for function execution and access restrictions. The changelog Markdown fetch failed (unsupported web content type; shell fallback could not resolve host), so no changelog review is claimed. No new Supabase API is introduced. Project-specific custom-session rules take precedence over generic auth.uid() examples.

## Download integration

Decision: native Response on server and a local fetch/Blob download in `src/app/report/daily-totals.tsx`; no shared helper refactor.
Rationale: installed Next.js route-handler guide permits native Response. `requestJson` unconditionally parses JSON; a local handler can preserve the existing `staff-session-ended` event on 401 while displaying failures without downloading them.
Alternatives considered: raw link (poor error/session handling), JSON containing CSV (unnecessary encoding), modifying every request helper caller (unnecessary scope).

## File format

Decision: UTF-8 BOM, comma separation, CRLF, quoted fields with doubled embedded quotes, two decimal SGD, and text-cell formula neutralization. See exact layout in the contract.
Rationale: readable names and predictable spreadsheet import; untrusted snapshot names must remain text.
Alternatives considered: new CSV dependency, XLSX, configurable columns. None needed for this fixed format.

Read-only research delegation inspected the current report, staff helper and snapshot writes and confirmed per-cup option pricing, one-row-per-line aggregation and session-expiry handling. No unresolved research questions remain.
