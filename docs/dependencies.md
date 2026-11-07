# Dependencies

What each remaining feature needs before it can work, as of 7 Nov 03:00. Updated from the team's Dependencies doc (3 Nov). Build status is in [`features.md`](features.md).

## Live site setup (done 7 Nov, moved to Singapore the same day)

The live site uses the team database `beans-beats-qms-sg` (Supabase, in Win's organisation). All migrations in `supabase/migrations/` are applied, the four Vercel environment variables are set, and the shared test logins in the [README](../README.md#test-logins) work. The 20 old mock staff accounts are switched off. The database and Vercel's functions both run in Singapore (moved 7 Nov). The old Ireland project `beans-beats-qms` is paused as a fallback.

When your PR adds a migration, tell Henry or Win so it gets applied to the team database after merging.

## Already built (reuse these)

| What                                       | Where                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Schema, order numbering, price snapshots   | `supabase/migrations/2026110300*`                                                               |
| Staff sign-in and session (`requireStaff`) | `src/lib/staff-server.ts`, `src/components/staff-workspace.tsx`, `/api/staff/session`           |
| Creating orders (F1)                       | `/order`, `/api/counter/orders`, `counter_submit_order`                                         |
| Menu reads and edits (F10-F12)             | `/menu`, `/api/counter/menu`, `counter_edit_menu`, `useMenu()`                                  |
| Ready board (F9)                           | `/board`, public `ready_orders()`                                                               |
| Daily totals and CSV (F13, F14)            | `/report`, `/api/report/daily-totals`, `/api/report/csv`, `report_*` functions                  |
| Guest status read                          | public `guest_order_status(tracking token)`, QR on the F1 receipt (`src/lib/order-tracking.ts`) |
| Design tokens and `Button`                 | `src/app/globals.css`, `src/components/button.tsx`, `/design`                                   |

## Remaining features

| Feature                      | Owner | Can start now? | Needs                                                                                                                                             |
| ---------------------------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4 Order queue               | Pooj  | Yes            | A staff route listing today's `queued`, `preparing` and `ready` orders with their items (new `p_staff_id` function).                              |
| F5 One-tap status updates    | Pooj  | After F4       | A new `p_staff_id` status function with the `version` check, reusing the transitions in Win's `update_order_status`.                              |
| F6 Live queue updates        | Pooj  | After F4       | Poll the F4 route every few seconds (staff pages can't use Realtime on `orders` either, because sign-in is not Supabase Auth).                    |
| F16 Offline mode and sync    | Win   | After F4, F5   | Keep the queue readable offline, queue status changes and new orders for later sync; see the 7 Nov owner clarification in `decisions.md`.         |
| F17 Staff logins             | TL    | Mostly done    | Sign-in exists (F1). Left: a sign-out button on each staff page, test logins for judges, and role checks on any new routes.                       |
| F18 Personal data handling   | Henry | Yes            | Privacy notice built in F7; a clean-up step that removes names and mobiles after the event.                                                       |
| F19 Reset between event days | Henry | Yes            | Numbers already restart per Singapore day. Left: the README "Daily reset" steps and, if wanted, a check that the board and queue show only today. |

## The order the pitch needs

The demo only needs one flow working end to end on the live site:

order (F1, done) → queue and status buttons (F4, F5) → ready board (F9, done) → guest page (F7)

Build F4, F5 and F7 first. Menu, reports, CSV and offline come after.
