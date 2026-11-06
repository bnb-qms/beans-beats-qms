# Beans&Beats Queue

Order and pickup system for the Beans&Beats booth at Christmas Together 2026 (Hall F, Marina Bay Sands, 26 to 29 Nov).

|                             |                                    |
| --------------------------- | ---------------------------------- |
| **Live app**                | https://beans-beats-qms.vercel.app |
| **Demo video**              | _to be added_                      |
| **Technical summary (PDF)** | _to be added_                      |
| **Test logins**             | [below](#test-logins)              |

## Test logins

Shared staff accounts for testing the staff screens (`/order`, `/menu`, and later `/queue` and `/report`) on the live site and PR previews:

| Role    | Username          | Password                 | Can do                                                     |
| ------- | ----------------- | ------------------------ | ---------------------------------------------------------- |
| Admin   | `preview-admin`   | `local-preview-password` | Everything, including prices, deactivating drinks, reports |
| Barista | `preview-barista` | `local-preview-password` | Take orders, update the queue, mark items sold out         |

These are public test accounts. Change both passwords before the event (26 Nov), and never use them for real staff.

## Stack

Next.js (App Router, Route Handlers) · TypeScript · Tailwind CSS · Supabase (Postgres) · Vitest · Vercel. Offline storage (IndexedDB + service worker) is added by its owner.

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

The team's hosted project (`beans-beats-qms`) has every migration applied, recorded in Supabase's migration history under shortened names, so check `supabase migration list` before using `db push` against it. When a PR adds a migration, apply it to the hosted project after merging.

Staff accounts live in `public.staff` with a salted bcrypt hash in `password_hash` (for example `extensions.crypt('a-password', extensions.gen_salt('bf'))`), never plaintext. Staff sign in through the app's server (`/api/staff/session`, `src/lib/staff-server.ts`), which uses the secret key in `SUPABASE_SERVICE_ROLE_KEY` and a signed cookie made with `STAFF_SESSION_SECRET`. Never put either in the browser or a `NEXT_PUBLIC_` variable. The shared test accounts are under [Test logins](#test-logins).

`supabase/insert_mock_data.sql` is for a disposable test database only. Its 20 `mock_staff_*` accounts have public passwords; on the hosted project they are switched off.

Staff actions go through server-only database functions that take the signed-in staff ID: `counter_submit_order` (orders), `counter_edit_menu` (prices, sold out, deactivate), `report_daily_totals` and `report_csv_export`. The public guest page and ready board use `guest_order_status` and `ready_orders`, which never return mobile numbers. Win's original `create_order`, `update_order_status` and `daily_sales` are switched off. See [`docs/building.md`](docs/building.md) for how to add new ones.

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
