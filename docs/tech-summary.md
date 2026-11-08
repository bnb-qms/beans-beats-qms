# Technical Summary — Beans&Beats Queue

**Beans&Beats Queue** is a browser-based order and pickup queue system for the **Christmas Together 2026** charity coffee booth at Marina Bay Sands, Singapore. Staff and guests manage and track orders on tablets, phones, and displays without app downloads or customer accounts.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4.
- **Backend & Database:** Next.js Route Handlers and Supabase (PostgreSQL, `pgcrypto`, `security definer` RPCs).
- **Offline Storage:** Dexie.js (IndexedDB) and a custom Service Worker (`public/sw.js`).
- **Testing & Tooling:** `qrcode`, Vitest, Happy DOM, `fake-indexeddb`, SQL regression tests, ESLint, Prettier.
- **Deployment:** Vercel (functions in Singapore, `sin1`) and Supabase Cloud (Singapore, `ap-southeast-1`).

## Architecture

The system enforces a four-layer security boundary:

1. **Public Clients (`/board`, `/o/track#<token>`):** Poll read-only RPCs (`ready_orders`, `guest_order_status`) every 3 seconds via the anonymous Supabase client.
2. **Staff Workspace (`/order`, `/queue`, `/scan`, `/menu`, `/report`):** Authenticates against pre-provisioned `public.staff` accounts (`bcrypt` password hashes) using a signed 12-hour `HttpOnly` cookie.
3. **API Route Handlers (`/api/*`):** Verify origins (`checkOrigin`) and active sessions (`requireStaff`) before calling PostgreSQL with the server-only `SUPABASE_SERVICE_ROLE_KEY`.
4. **Database RPC Layer:** Direct table access is blocked. All writes and reports run via `security definer` functions verifying `p_staff_id`, active status, and role (`barista` vs. `admin`).

## Order Lifecycle

Orders move Queued → Preparing → Ready → Collected, one step at a time. Staff can **cancel** any uncollected order from the barista queue after a confirmation; it leaves the queue and board, the guest page shows "Cancelled", and daily totals exclude it (the CSV keeps it marked as cancelled). Refunds stay on the organiser's POS.

A customer-facing **pickup scanner** (`/scan`) reads the QR on the guest's tracking page with the laptop webcam (jsQR). A Ready order is marked Collected and the screen turns green; anything it cannot confirm turns amber and goes to the barista, whose **Mark collected** button remains the fallback.

## Offline Work and Syncing

The Service Worker caches the app shell while Dexie.js stores the menu, active queue, and session metadata in IndexedDB. During Wi-Fi drops, baristas create orders and update statuses locally. On reconnection, queued actions replay automatically in order:

- **Idempotent Submissions:** Offline orders keep a client-generated `client_request_id` (`UUID`) so retries never create duplicates.
- **Conflict Handling:** Status updates check the order's `version` number. Server conflicts or stock/price rejections are flagged as `Needs review` for staff resolution.
- **Pickup Scanner:** While online it keeps a copy of today's Ready orders holding only SHA-256 hashes of tracking codes. Offline, a code found in that copy still shows green and the scan is saved on the laptop, then sent automatically on reconnection.

## How Data Is Stored

PostgreSQL stores data in `staff`, `menu_items`, `add_ons`, `daily_order_counters`, `orders`, `order_items`, and `order_item_add_ons`. Orders group by Singapore date (`event_day`), with pickup numbers (`1, 2, 3...`) allocated atomically and resetting at midnight (`Asia/Singapore`). Order lines snapshot drink names, base prices, and add-on prices upon submission so menu edits never alter past totals. IndexedDB stores offline caches and pending actions on each device.

## PDPA Compliance

- **Minimisation & Consent:** A guest's first name is optional (max 20 characters). Optional Singapore mobile numbers require explicit consent and a timestamp.
- **Exposure Control:** Guest QR links keep random tokens in the URL hash (`#<token>`) so secrets never reach server logs or `Referer` headers. The public ready board shows the pickup number and the first name if given; CSV exports and daily totals contain no names or mobile numbers. Names and mobiles are visible only on signed-in staff screens.
- **Retention & Erasure:** Within 30 days post-event, `erase_guest_details` replaces names with `"Guest"` and clears mobile numbers and consent timestamps while preserving sales totals.

## Known Limitations

- **No POS Integration:** Staff enter totals on the organiser's POS manually and reconcile via CSV export.
- **Offline Receipts:** Offline orders get pickup numbers and tracking QRs only after server sync.
- **Browser Alerts Only:** Ready alerts require an open tracking tab; no SMS or push notifications are sent.
- **Polling Updates:** Live views use 3-second HTTP polling instead of WebSockets.
- **Manual Clean-Up:** Post-event data erasure and cache clearing require manual admin execution.
- **Cancellation Needs a Connection:** Cancel is disabled while a device is offline.
- **Receipt QR on the Staff Screen:** The tracking QR is shown on the counter tablet, so staff turn it towards the guest.
- **Scanner Hardware:** Webcam scanning has not yet been tested with booth lighting; orders marked Ready while the scanner was offline are sent to the barista.
