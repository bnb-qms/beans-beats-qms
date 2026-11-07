# Implementation plan: F16 Offline Mode and Sync

## Summary

Issue #14, owner Win, branch `feat/16`. This is the original implementation plan; the branch now also contains the F16 code. Add a limited offline staff workflow: cached queue and menu, persisted status actions and new orders, automatic safe retry, visible conflicts/failures, and cached screens. Keep the public board frozen while disconnected. Owner clarified on 7 Nov that new orders may be saved offline.

## Workflow adaptation

This repository has no `.specify/`, constitution, templates or extension hooks. Both skill setup scripts were attempted and are absent. Use the established `docs/plans/<feature>/` layout. Repository decisions, building guide, schema and AGENTS.md are the gates. No hooks exist to dispatch.

## Technical context

TypeScript, Next.js 16.4.3 App Router, React 19.3, Supabase/Postgres, Vitest. Dexie is used because F16 explicitly requires it. IndexedDB and service worker code is client-only. Current session is a signed 12-hour HttpOnly cookie, checked online with `requireStaff()`. `counter_submit_order` already accepts a stable request ID and deduplicates retries. F4/F5 are now merged and provide `/api/queue/orders` plus version-checked status updates.

## Scope and affected paths

- `src/lib/offline-store.ts` and tests: Dexie schema, per-staff cached queue/menu and pending actions/orders, transactional writes and safe cleanup.
- `src/lib/offline-sync.ts` and tests: serialized retries, version conflict handling, idempotent order submission, auth failure lock and explicit resolution.
- `src/components/staff-workspace.tsx`, `src/app/api/staff/session/route.ts`, and session tests: bounded offline eligibility, sign-out lock and reconnection recheck without exposing the cookie or secret.
- F4/F5 queue component and API paths once merged, plus their tests: local fallback, optimistic status, pending/conflict UI, authoritative refresh.
- `src/app/order/order-entry.tsx`, `src/components/use-menu.ts`, and tests: cached menu, persisted pending order, reconnect retry and no provisional receipt/tracking.
- `src/app/board/ready-board.tsx`: preserve last confirmed board list and visible stale state.
- `public/sw.js`, `src/components/service-worker-registration.tsx`, `src/app/layout.tsx`: offline shell registration and targeted shell cache. Keep API and private data out of worker caches.
- A new `supabase/migrations/<timestamp>_offline_status_sync.sql` and `supabase/tests/offline_status_sync.sql` only if F5's final migration does not already supply the required trusted `p_staff_id` plus expected-version atomic status update. Do not edit merged migrations.
- Relevant docs/spec copy and dependency notes after implementation. No new general-purpose framework, background server job, guest ordering, SMS, or offline admin mutation.

## Design

See [research](research.md), [data model](data-model.md), [contracts](contracts/offline-sync.md), [validation guide](quickstart.md), and [tasks](tasks.md). A successful online session establishes a bounded local eligibility marker; a disconnected device cannot sign in or gain a role. Recheck the session before uploads. Store private cache per staff identity. Status changes are conditional on server version and held for manual review on conflict. New orders reuse their exact request ID and payload; server rejection keeps the POS reconciliation task visible. The board never renders locally pending status as confirmed public state.

## Gates

Pre-design: PASS after Win's 7 Nov owner clarification. The prior `docs/decisions.md` row and F16 spec disagreed; the clarification supersedes the row. Post-design: PASS, subject to implementation verifying F4/F5's merged contracts and adding an authenticated status RPC only if absent. Preserve personal data access controls and avoid API cache. The implementation must pass `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build` before push; one PR into `main` with `Closes #14`, green CI and SE-EDU commits.

## Commit rule

Complete and verify one coherent change at a time, then stage only its paths and commit immediately with an imperative, capitalised SE-EDU subject of at most 72 characters and no full stop. The checkpoints and proposed subjects are in `tasks.md`; never commit a failing state. Re-run affected checks for each checkpoint and all five repository checks before pushing.
