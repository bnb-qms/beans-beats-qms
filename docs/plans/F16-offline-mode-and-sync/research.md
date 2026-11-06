# F16 research and decisions

## Source reconciliation

**Decision:** Offline new-order submissions are allowed per Win's 7 Nov 2026 clarification, recorded in `docs/decisions.md`. **Rationale:** resolves the direct conflict between F16 FR11/12/16 and the older 6 Nov decision. **Alternative:** retain drafts but prohibit offline submission; superseded by owner.

## Existing integration

**Decision:** Build on F4/F5's authenticated queue read and version-checked status route once they land. This branch currently has only a `/queue` placeholder, so do not invent a competing queue. Continue using `StaffWorkspace`, `requireStaff`, server-supplied staff IDs, `requestJson` session-ended behavior, and `counter_submit_order` with its unique `client_request_id`. **Rationale:** current staff pages use a signed cookie, not Supabase Auth; the legacy status RPC is not authorized for this model. **Alternative:** direct browser table access or a second queue API; rejected by `docs/building.md`.

## Local persistence and shell

**Decision:** Use one small IndexedDB database via Dexie (required by F16) for last confirmed queue/menu snapshots and per-staff pending status/order records. Register a same-origin service worker from a client component to cache only previously visited app shell assets and navigation responses for `/queue`, `/order`, `/menu`, and `/board`; never cache `/api/`, sessions, private responses, or the staff page HTML shared across accounts. **Rationale:** IndexedDB survives refresh; the worker enables revisiting the shell while disconnected; protected data stays under the staff gate. **Alternative:** Cache API for private JSON or `sessionStorage` alone; insufficient persistence and isolation.

## Authentication boundary

**Decision:** A successful online session check records only staff ID, role, and the signed cookie's 12-hour expiry as a local eligibility marker; offline workspace access requires the still-unexpired marker and an unlocked session on that device, and is restricted to that staff's cached data. The HttpOnly cookie cannot be inspected by client code while offline. On sign-out, lock the local store without deleting pending work. Reconnection must revalidate session and role before any upload; 401/403 locks sync and preserves records. **Rationale:** F17 FR8–10 and the current `staffSession()` always query the server, so an offline fallback must never silently grant new access. **Alternative:** indefinite local login or shared device-wide cache; rejected. **Limit:** browser-local access is an application gate, not protection against a person with physical/browser storage access to the same unlocked device; assess device policy before storing customer data offline.

## Synchronization

**Decision:** Store a status action with order ID, expected version, target status, owner staff ID and a stable local action ID in one IndexedDB transaction with the optimistic view. Replay each order's actions in order, one writer per tab/device. On success, replace the confirmed snapshot/version before deleting the acknowledged action; on a 409, retain and flag it, fetch server state, and require explicit staff choice. Keep network/5xx failures pending with retry status. **Rationale:** version checks prevent silent overwrite. **Alternative:** last-write-wins; rejected.

**Decision:** Persist a new order's existing `Draft.requestId`, validated draft and POS-confirmed total as one pending submission before showing it as saved. Retry that exact payload using the existing endpoint and request ID. Show “pending sync” without a server pickup number or tracking link. Remove only after a valid server receipt has been durably recorded. A 409 price/availability rejection needs staff/POS reconciliation; no automatic repricing or new request ID. **Rationale:** `counter_submit_order` already deduplicates by `client_request_id` and validates current prices and availability. **Alternative:** provisional pickup numbers or silent price changes; rejected.

## Connectivity and board

**Decision:** Use actual request success/failure for sync state and `online`/visibility events only as retry triggers. Preserve the F9 board's last list and reconnecting notice. **Rationale:** `navigator.onLine` alone cannot prove reachability. **Alternative:** unconditional retries on every render; rejected.

## Remaining implementation research

Before writing implementation, read installed Next.js guides for route handlers, client components and deployment/service worker handling. Verify the actual F4/F5 response shapes and status contract after their PRs land. Verify browser support for the selected Dexie version before installation. These are implementation checks, not unresolved product decisions.
