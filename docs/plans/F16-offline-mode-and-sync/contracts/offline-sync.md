# F16 interfaces and behavior contract

## Existing server interfaces

- `GET /api/staff/session`: retain existing `{ staff }` behavior and add a server-issued expiry for an active session so offline eligibility is bounded by the signed cookie's 12 hours. Never return token, password hash or secret. A session check is authoritative only while online. `DELETE` locks local access immediately in the client even if a later session check is unavailable; pending records are retained for the same identity.
- `GET /api/queue` and the F5 status route: use their final merged names/shapes, not the placeholder. The read response must include each order's ID, status and version with display fields. The status write must take order ID, expected version and next status; the route supplies `p_staff_id` from `requireStaff()`. On version mismatch return 409 and latest safe order state (or permit a separate authenticated refetch). No unguarded last-write-wins endpoint.
- `POST /api/counter/orders`: reuse `{ draft, totalCents }` with the original `draft.requestId`. A success includes the real receipt. A repeated identical request returns the same receipt. 409 price/availability mismatch keeps the local submission for staff/POS reconciliation. Never generate a new request ID for an ambiguous network failure.

All staff routes use `Cache-Control: no-store`, `checkOrigin` on writes, trusted session identity, and database role checks. Network errors do not imply that a write failed; retry with the same identifiers. Only successful server acknowledgments clear pending work.

## Browser contract

- Queue and menu display last confirmed local data when disconnected, visibly marked stale. They show counts for pending actions, failures and conflicts. A saved local status may appear in the staff queue with a pending label, but never on public screens before server acknowledgment.
- A conflict shows the server state and intended local action, then offers explicit retry from current version when the transition remains valid or discard after staff review. Repeated taps do not enqueue duplicate transitions. A collected local order can be hidden from the active staff list while its pending action remains inspectable.
- Offline order saving displays a local pending reference only, never a pickup number, QR/tracking claim or server receipt. After a confirmed receipt it displays the actual number. Price or stock rejection displays the unchanged amount and tells staff to reconcile the separate POS before editing/retrying.
- A signed-out, expired or different staff identity cannot read another staff member's IndexedDB records through the app. No offline fresh sign-in; reconnection and active role check are required before upload.
- Service worker caches only visited shell routes/static assets. It never caches `/api/`, session responses, private JSON, or staff data. Cache version changes remove obsolete shell entries without deleting IndexedDB pending work.
