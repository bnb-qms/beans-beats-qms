# Dependencies

What each remaining feature needs before it can work, as of 6 Nov 21:30. Updated from the team's Dependencies doc (3 Nov). Build status is in [`features.md`](features.md).

## Blocks the live site (not code)

Until these are done, the deployed app cannot read or save real data. Staff routes answer "Staff service is not configured"; the ready board shows sample data.

| Needed                                                                                                                              | Who         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Supabase URL and publishable key added to Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)               | Win → Henry |
| Secret key and session secret added to Vercel (`SUPABASE_SERVICE_ROLE_KEY`, `STAFF_SESSION_SECRET`), pasted directly, never in chat | Win, Henry  |
| Win's updated first migration re-run on the hosted database, then all migrations after it, in filename order                        | Win         |
| The 20 mock staff accounts (public passwords) deleted, and test logins created for judges: one `barista`, one `admin`               | Win         |

## Already built (reuse these)

| What                                       | Where                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Schema, order numbering, price snapshots   | `supabase/migrations/2026110300*`                                                     |
| Staff sign-in and session (`requireStaff`) | `src/lib/staff-server.ts`, `src/components/staff-workspace.tsx`, `/api/staff/session` |
| Creating orders (F1)                       | `/order`, `/api/counter/orders`, `counter_submit_order`                               |
| Menu reads and edits (F10-F12)             | `/menu`, `/api/counter/menu`, `counter_edit_menu`, `useMenu()`                        |
| Ready board (F9)                           | `/board`, public `ready_orders()`                                                     |
| Guest status read                          | public `guest_order_status(p_tracking_token)`                                         |
| Design tokens and `Button`                 | `src/app/globals.css`, `src/components/button.tsx`, `/design`                         |

## Remaining features

| Feature                        | Owner | Can start now? | Needs                                                                                                                                             |
| ------------------------------ | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4 Order queue                 | Pooj  | Yes            | A staff route listing today's `queued`, `preparing` and `ready` orders with their items (new `p_staff_id` function).                              |
| F5 One-tap status updates      | Pooj  | After F4       | A new `p_staff_id` status function with the `version` check, reusing the transitions in Win's `update_order_status`.                              |
| F6 Live queue updates          | Pooj  | After F4       | Poll the F4 route every few seconds (staff pages can't use Realtime on `orders` either, because sign-in is not Supabase Auth).                    |
| F7 Order tracking via QR       | TL    | Yes            | `guest_order_status(p_tracking_token)` for the `/o/[id]` page. F7 supplies the private tracking QR on F1's receipt screen.                        |
| F8 Live status and ready alert | TL    | After F7       | Poll `guest_order_status` every 3 seconds; full-screen orange "Ready" state from `/design`.                                                       |
| F13 Daily totals               | Win   | Yes            | A new admin-only `p_staff_id` function (Win's `daily_sales` logic), exclude `cancelled`.                                                          |
| F14 CSV export                 | Win   | After F13      | The F13 query, plus the CSV columns from the organisers.                                                                                          |
| F16 Offline mode and sync      | Win   | After F4, F5   | Keep the queue readable offline and queue status changes for later. New orders stay online only (decided).                                        |
| F17 Staff logins               | TL    | Mostly done    | Sign-in exists (F1). Left: a sign-out button on each staff page, test logins for judges, and role checks on any new routes.                       |
| F18 Personal data handling     | Henry | Yes            | Privacy notice built in F7; a clean-up step that removes names and mobiles after the event.                                                       |
| F19 Reset between event days   | Henry | Yes            | Numbers already restart per Singapore day. Left: the README "Daily reset" steps and, if wanted, a check that the board and queue show only today. |

## The order the pitch needs

The demo only needs one flow working end to end on the live site:

order (F1, done) → queue and status buttons (F4, F5) → ready board (F9, done) → guest page (F7)

Build F4, F5 and F7 first. Menu, reports, CSV and offline come after.
