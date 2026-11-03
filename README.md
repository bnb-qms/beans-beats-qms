# Beans&Beats Queue

Order and pickup system for the Beans&Beats booth at Christmas Together 2026 (Hall F, Marina Bay Sands, 26 to 29 Nov).

|                             |                       |
| --------------------------- | --------------------- |
| **Live app**                | _to be added_         |
| **Demo video**              | _to be added_         |
| **Technical summary (PDF)** | _to be added_         |
| **Test logins**             | _added at submission_ |

## Stack

Next.js (App Router, Route Handlers) · TypeScript · Tailwind CSS · Supabase (Postgres, Realtime) · Vitest · Vercel. Offline storage (IndexedDB + service worker) is added by its owner.

## Modules

| Module                | Route     |
| --------------------- | --------- |
| 1. Order screen       | `/order`  |
| 2. Barista queue      | `/queue`  |
| 3. Guest status page  | `/o/[id]` |
| 4. Ready board        | `/board`  |
| 5. Menu controls      | `/menu`   |
| 6. Daily sales report | `/report` |

## Setup

Needs Node 22 or later.

```bash
npm ci
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
npm run dev                  # http://localhost:3000
```

Supabase helpers are in `src/lib/supabase/` (`client.ts` for the browser, `server.ts` for server code).

### Supabase database

The schema is in `supabase/migrations/`. Create a Supabase project, set the URL and publishable key in `.env.local`, then apply the migrations in filename order with the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --remote
```

For the existing hosted project, the migrations were run in the Dashboard SQL Editor. Before using CLI `db push` against that project, reconcile its migration history with the applied SQL; otherwise the CLI may try to create the tables again.

Staff accounts are a fixed set provisioned by a trusted administrator in `public.staff`. Store only a salted hash in `password_hash` (for example, `extensions.crypt('a-secret-password', extensions.gen_salt('bf'))`), never plaintext. The `verify_staff_credentials` function is available only to a trusted server using a Supabase secret/service key. Do not put that key in the browser or a `NEXT_PUBLIC_` variable. The app's staff login and server session flow are not implemented yet, so privileged database operations are disabled until they are wired up. Do not use `supabase/insert_mock_data.sql` for production accounts.

For a disposable test database, `supabase/insert_mock_data.sql` inserts directly into the existing tables. It creates 20 staff profiles with usernames `mock_staff_01`–`mock_staff_20` and corresponding passwords `MockPass01!`–`MockPass20!`, plus the five drinks, two add-ons, and 20 sample rows in the remaining tables. These passwords are intentionally public test credentials.

The schema defines `create_order`, `update_order_status`, `guest_order_status`, `ready_orders`, and `daily_sales` RPC functions. Guest and board functions omit customer contact details. The privileged functions are disabled for browser clients until server-side staff sessions are implemented. `create_order` accepts client-generated UUIDs (`p_id`, `p_client_request_id`), first name, optional mobile, and an item array such as `[ { "menu_item_id": "...", "quantity": 2, "add_on_ids": ["..."] } ]`. Retry with the same UUIDs after an offline interruption. `update_order_status` requires the current `version`; on a conflict, reload the order before retrying.

## Checks

These run in CI on every PR and must pass before merging:

```bash
npm run lint
npm run format:check   # npm run format fixes it
npm run typecheck
npm test
npm run build
```

## Workflow

1. Pick an issue on the project board (or create one), assign yourself and move it to **In Progress**.
2. Branch off the latest `main`: `git switch main && git pull && git switch -c 12-order-screen` (issue number + short name).
3. Commit in [SE-EDU style](https://se-education.org/guides/conventions/git.html): imperative, capitalised, no full stop, subject up to 72 characters, e.g. `Add one-tap status update`.
4. Push the branch to this repo and open a PR into `main` with `Closes #12`. Move the issue to **In Review**.
5. `main` is protected: merge once CI is green. Reviews are welcome but not required.

### Labels

- `type.*`: Story, Task, Bug, Enhancement, Epic
- `priority.*`: High (must do), Medium (nice to have), Low (unlikely to do)
- `severity.*`: for bugs, VeryLow to High
- `module.*`: order, queue, guest, board, menu, report; `area.*`: sync, auth for cross-cutting work

## Daily reset

_To be written by whoever owns event-day reset (F19)._
