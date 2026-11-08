# Technical Summary — Beans&Beats Queue

**Beans&Beats Queue** is a browser-based order and pickup queue system for the **Christmas Together 2026** charity coffee booth at Marina Bay Sands, Singapore. Staff and guests manage and track orders on tablets, phones, and displays without app downloads or customer accounts.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4.
- **Backend & Database:** Next.js Route Handlers and Supabase (PostgreSQL, `pgcrypto`, `security definer` RPCs).
- **Offline Storage:** Dexie.js (IndexedDB) and a custom Service Worker (`public/sw.js`).
- **Testing & Tooling:** `qrcode`, Vitest, Happy DOM, `fake-indexeddb`, SQL regression tests, ESLint, Prettier.
- **Deployment:** Vercel and Supabase Cloud in Singapore (`sin1`).

## Architecture

The system enforces a four-layer security boundary:

1. **Public Clients (`/board`, `/o/track#<token>`):** Poll read-only RPCs (`ready_orders`, `guest_order_status`) every 3 seconds via the anonymous Supabase client.
2. **Staff Workspace (`/order`, `/queue`, `/menu`, `/report`):** Authenticates against pre-provisioned `public.staff` accounts (`bcrypt` password hashes) using a signed 12-hour `HttpOnly` cookie.
3. **API Route Handlers (`/api/*`):** Verify origins (`checkOrigin`) and active sessions (`requireStaff`) before calling PostgreSQL with the server-only `SUPABASE_SERVICE_ROLE_KEY`.
4. **Database RPC Layer:** Direct table access is blocked. All writes and reports run via `security definer` functions verifying `p_staff_id`, active status, and role (`barista` vs. `admin`).

## Offline Work and Syncing

The Service Worker caches the app shell while Dexie.js stores the menu, active queue, and session metadata in IndexedDB. During Wi-Fi drops, baristas create orders and update statuses locally. On reconnection, queued actions replay automatically in order:

- **Idempotent Submissions:** Offline orders keep a client-generated `client_request_id` (`UUID`) so retries never create duplicates.
- **Conflict Handling:** Status updates check the order's `version` number. Server conflicts or stock/price rejections are flagged as `Needs review` for staff resolution.

## How Data Is Stored

PostgreSQL stores data in `staff`, `menu_items`, `add_ons`, `daily_order_counters`, `orders`, `order_items`, and `order_item_add_ons`. Orders group by Singapore date (`event_day`), with pickup numbers (`1, 2, 3...`) allocated atomically and resetting at midnight (`Asia/Singapore`). Order lines snapshot drink names, base prices, and add-on prices upon submission so menu edits never alter past totals. IndexedDB stores offline caches and pending actions per staff account.

## PDPA Compliance

- **Minimisation & Consent:** Only a guest's first name (max 20 characters) is required. Optional Singapore mobile numbers require explicit consent and a timestamp.
- **Exposure Control:** Guest QR links keep random tokens in the URL hash (`#<token>`) so secrets never reach server logs or `Referer` headers. Public views and CSV exports exclude phone numbers.
- **Retention & Erasure:** Within 30 days post-event, `erase_guest_details` replaces names with `"Guest"` and clears mobile numbers and consent timestamps while preserving sales totals.

## Known Limitations

- **No POS Integration:** Staff enter totals on the organiser's POS manually and reconcile via CSV export.
- **Offline Receipts:** Offline orders get pickup numbers and tracking QRs only after server sync.
- **Browser Alerts Only:** Ready alerts require an open tracking tab; no SMS or push notifications are sent.
- **Polling Updates:** Live views use 3-second HTTP polling instead of WebSockets.
- **Manual Clean-Up:** Post-event data erasure and cache clearing require manual admin execution.
