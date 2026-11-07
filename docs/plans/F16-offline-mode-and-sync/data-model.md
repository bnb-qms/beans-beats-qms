# F16 local data model

No new server table is required. Server `orders.version`, `orders.client_request_id`, status transitions, snapshot prices and the existing staff session remain authoritative.

## IndexedDB records

- **Eligibility**: staff ID (UUID), role (`barista`/`admin`/`counter`), verified-at timestamp and bounded expiry from the server session; no password, token or cookie value. Only a previously verified eligible staff member may open that staff's cached records, and only until expiry. Lock on sign-out or server 401/403. Revalidate online before upload.
- **Queue snapshot**: staff ID, order ID (UUID), event day, pickup number (positive integer), first name, items/options, status (`queued`, `preparing`, `ready`), version (positive integer), creation/update times. It contains only orders returned by the trusted F4 route. A collected/cancelled order may remain locally only while needed to reconcile an action, never in the active list.
- **Menu snapshot**: staff ID, last confirmed menu payload and fetched-at timestamp. It is labelled stale offline. Admin edits remain disabled.
- **Pending status action**: stable local UUID, staff ID, order ID, expected version, target next status (`preparing`, `ready`, `collected`), created-at timestamp, state (`pending`, `retrying`, `failed`, `conflict`) and plain error code/message. Ordered per order. Enqueue and optimistic display update in one local transaction; delete only after server acknowledgment and durable local snapshot update.
- **Pending order**: staff ID, stable `Draft.requestId` UUID, exact validated draft, POS-confirmed total cents (safe nonnegative integer), created-at timestamp, state (`pending`, `retrying`, `failed`, `review`), and optional confirmed receipt. Never fabricate an order number. Keep the exact request ID/payload through retries and refresh. Delete after receipt is durably stored and shown. A price/availability/authorization problem stays for review.

## State transitions

Status action: pending → retrying → acknowledged/deleted; retrying → failed → retrying; retrying → conflict → staff review → retry with explicitly chosen valid transition or discard after reconciliation. A local later action cannot sync before the earlier action for the same order. New order: pending → retrying → server receipt → local removal; retrying → failed → retrying; retrying → review on 409, with no silent total or request ID change. Any 401/403 locks upload and preserves all records.

The board uses only its last confirmed server response. Pending local changes and pending new orders do not enter its public view.
