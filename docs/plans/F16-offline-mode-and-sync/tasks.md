# Tasks: F16 Offline Mode and Sync

Issue #14 · Owner Win · Branch `feat/16`

Read [plan](plan.md), [story map](spec.md), [data model](data-model.md), [contract](contracts/offline-sync.md), and [quickstart](quickstart.md). Each checklist task is an implementation action; only the planning docs have been written. F4/F5 must land before US2. Tests are required by `docs/README.md` and `docs/building.md`. A `[P]` marker means the task may run in parallel with other tasks that edit different files after its prerequisites are complete.

## Phase 1: Setup

- [ ] T001 Confirm `feat/16` is the issue #14 branch, update it from `main` without discarding work, and read `AGENTS.md`, `docs/README.md`, `docs/decisions.md`, `docs/building.md`, `docs/specs/F16-offline-mode-and-sync.md`, and the installed Next.js guides under `node_modules/next/dist/docs/01-app/` before implementation.
- [ ] T002 Inspect merged F4/F5 queue route, status RPC, component and tests under `src/app/queue/`, `src/app/api/`, and `supabase/migrations/`; replace the provisional route names in `docs/plans/F16-offline-mode-and-sync/contracts/offline-sync.md` with their actual paths and record missing version checks before coding.
- [ ] T003 Add Dexie to `package.json` and `package-lock.json` after checking the selected version's browser support; use no other new dependency. Run `npm run typecheck`, stage these two files only, and commit `Add Dexie for offline storage`.

## Phase 2: Foundation

- [ ] T004 Add `src/lib/offline-store.ts` and `src/lib/offline-store.test.ts` with per-staff IndexedDB queue/menu snapshots, pending status and pending order stores; use required UUIDs, positive versions/quantities, exact request IDs and safe nonnegative total cents from `data-model.md`; verify atomic enqueue, refresh persistence, quota failure and no cross-staff read. Commit `Persist staff offline work locally` after focused tests.
- [ ] T005 Add expiry to active `GET /api/staff/session` in `src/app/api/staff/session/route.ts` and its route tests, deriving it from the existing signed 12-hour cookie without exposing its value; confirm inactive/missing sessions return no offline eligibility. Commit `Expose bounded staff session expiry` after route tests.
- [ ] T006 Integrate the bounded eligibility gate, sign-out lock and reconnection recheck into `src/components/staff-workspace.tsx` and focused tests; an unexpired prior online verification and unlocked same-staff session are required offline, a different identity sees no prior cache, and 401/403 preserves but locks pending records. Commit `Gate offline workspace by staff session` after focused tests.
- [ ] T007 Add `public/sw.js`, `src/components/service-worker-registration.tsx` and registration in `src/app/layout.tsx`; cache only visited `/queue`, `/order`, `/menu`, `/board` shell and static assets, never `/api/`, cookies or private JSON, and clean obsolete shell caches. Add an assert-based worker/cache test in `src/components/service-worker-registration.test.ts`; commit `Cache visited application screens offline` after tests and a production build.

## Phase 3: US1 — View cached queue offline (P1)

Goal: a previously authenticated barista can reopen the last confirmed queue during an outage. Independent test: visit queue online, disconnect and reload; only that staff member sees cached orders with a stale indicator, while fresh/signed-out users cannot enter.

- [ ] T008 [US1] Store each successful F4 queue response in `src/app/queue/` through `src/lib/offline-store.ts` before showing it as confirmed; on failed fetch load only the eligible staff's latest snapshot, preserve order sequence and versions, and show an offline/stale indicator. Add component tests for reload, empty cache, expiry and identity switch; commit `Show cached barista queue offline` after focused tests.
- [ ] T009 [P] [US1] Persist the last confirmed menu response in `src/components/use-menu.ts` through `src/lib/offline-store.ts`, restore it for an eligible staff member offline with a stale label, and keep admin edits disabled without a server connection; add tests in `src/components/use-menu.test.ts`. Commit `Show cached staff menu offline` after focused tests.

## Phase 4: US2 — Update statuses and resolve conflicts (P1)

Goal: offline status actions survive restart, replay in order, and stop for explicit review if the server version has changed. Independent test: queue three transitions offline, restart, reconnect, verify the server's final status/version and empty pending queue; repeat with another device's intervening update and verify a retained conflict.

- [ ] T010 [US2] If F5 lacks a trusted version-checked function, create `supabase/migrations/<timestamp>_offline_status_sync.sql` and `supabase/tests/offline_status_sync.sql` with `p_staff_id`, order UUID, required positive expected version and next status constrained to queued → preparing → ready → collected, active barista/admin check, `BB_CONFLICT` on mismatch, schema-qualified security definer and service-role-only execute grant; keep F5's cancellation policy. Commit `Guard offline status replay by version` after rollback SQL tests. If F5 already provides this contract, mark T010 skipped with evidence in `quickstart.md`.
- [ ] T011 [US2] Add `src/lib/offline-sync.ts` and `src/lib/offline-sync.test.ts` to serialize status actions per order, prevent double replay across tabs, revalidate session/role before writes, update confirmed snapshot and remove only acknowledged actions atomically; retain network/5xx failures and stop on 401/403. Commit `Replay pending status changes safely` after focused tests.
- [ ] T012 [US2] Connect queue status buttons in `src/app/queue/` to durable action enqueue and pending display before local success feedback; prevent repeated taps and keep a locally collected order accessible in pending review. Test refresh and multiple queued transitions; commit `Save offline status taps in queue` after focused tests.
- [ ] T013 [US2] Add conflict, failure and pending counts plus staff resolution UI in `src/app/queue/`; show current server state beside intended action, retry only an explicitly chosen valid transition with the new version or discard after review, and never silently overwrite. Test both paths and accessibility announcements; commit `Let staff resolve sync conflicts` after focused tests.

## Phase 5: US3 — Save and submit new orders offline (P1)

Goal: a POS-confirmed order is durably stored during an outage and reaches the server once with its original request ID; changed price/stock requires review. Independent test: save offline, restart, reconnect and confirm one server receipt/queue entry; repeat after a lost response and after a menu change.

- [ ] T014 [US3] Update `src/app/order/order-entry.tsx` to save the exact validated `Draft.requestId`, draft and POS-confirmed total to `src/lib/offline-store.ts` before displaying “pending sync”; never show a provisional pickup number or live tracking, never clear the current draft on storage failure, and keep optional mobile consent intact. Add component tests for refresh, storage error and no false receipt; commit `Save offline orders after POS confirmation` after focused tests.
- [ ] T015 [US3] Extend `src/lib/offline-sync.ts` and its tests to retry `POST /api/counter/orders` with the identical request ID/payload after online session recheck, deduplicate across tabs, persist the real receipt before removing pending submission, and retain ambiguous network/5xx failures. Verify one order on retry after a lost response; commit `Submit saved orders once after reconnect` after focused tests.
- [ ] T016 [US3] Add pending, failed and review UI in `src/app/order/order-entry.tsx` for server 409 price/availability, 401/403 access and network errors; show the unchanged POS amount, require deliberate reconciliation before changing the draft/request ID, and show the real number only after receipt. Test conflict and recovery; commit `Show offline order reconciliation` after focused tests.

## Phase 6: US4 — Keep visited screens useful offline (P2)

Goal: visited application shells reopen; the public board remains on its last confirmed state. Independent test: load screens and board online, disconnect/reload, confirm shell availability and frozen board; no API or private data appears in worker cache.

- [ ] T017 [US4] Update `src/app/board/ready-board.tsx` to label its last successful server result as stale when polling fails or the browser goes offline, without applying local staff actions; add focused tests and commit `Mark disconnected ready board as stale` after tests.
- [ ] T018 [US4] Verify offline navigation and worker cache boundaries in a production build using `docs/plans/F16-offline-mode-and-sync/quickstart.md`; fix only failures in `public/sw.js`, `src/components/service-worker-registration.tsx` or `src/app/layout.tsx`, then commit `Verify offline screen caching` if code or validation docs change.

## Final phase: Polish and delivery

- [ ] T019 Update stale copy in `src/components/use-menu.ts`, `src/app/order/order-entry.tsx`, `docs/specs/F01-counter-order-entry.md`, `docs/dependencies.md` and `docs/features.md` to match Win's 7 Nov decision; keep customer ordering out of scope. Commit `Align offline order guidance` after format check.
- [ ] T020 Run every scenario in `docs/plans/F16-offline-mode-and-sync/quickstart.md`, record actual outcomes and deferred browser/device checks there, then run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build` sequentially; fix failures and rerun affected gates before the final commit `Document offline validation`.
- [ ] T021 Review `git diff` for only issue #14 changes, push `feat/16`, open one PR into `main` with `Closes #14`, request Henry and Win review, and wait for green CI; record the PR URL and CI result in `docs/plans/F16-offline-mode-and-sync/quickstart.md` before calling it merge-ready.

## Dependencies and parallel work

T001–T007 establish the shared gate and storage. US1 follows foundation. US2 follows US1 and F4/F5. US3 follows foundation and can proceed alongside US2 once the order screen uses the same storage/sync contract. US4 follows worker registration and the board's existing F9 behavior. T009 and T017 can run alongside queue-specific work because they touch separate files. Resolve edits to `offline-store.ts` and `offline-sync.ts` serially.

MVP: US1 plus US2 gives the essential offline barista queue. Complete US3 and US4 for the full owner-approved F16 scope before claiming the issue done.

## Commit procedure for every change

After each task or coherent checkpoint: run its named focused test/check, inspect `git diff --check` and `git status --short`, stage only the files in that checkpoint with explicit paths, then `git commit -m "<proposed subject>"`. Use imperative, capitalised SE-EDU subjects, at most 72 characters, no full stop. Do not combine unrelated changes or commit a failing checkpoint. Before push, run all five repository checks and confirm CI is green after the PR.
