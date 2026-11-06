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

### Local test database

Copy `supabase/config.example.toml` to `supabase/config.toml` once; the latter is
ignored so each developer can keep their own local settings. Start Docker
Desktop's Linux engine, then run `npx supabase start`. The local configuration
applies every migration and loads `insert_mock_data.sql`
into the separate `beans-beats-qms` local database. It does not connect to a
hosted project. Do not load these public test credentials into a production database.

Use `npx supabase status -o env` to find the local API URL and keys. Copy the API
URL, anon key and service-role key to the corresponding variables in `.env.local`;
keep `STAFF_SESSION_SECRET` set to a random value of at least 32 characters. Restart
the app after changing environment values. Local test sign-ins:

| Role    | Username        | Password      |
| ------- | --------------- | ------------- |
| Barista | `mock_staff_02` | `MockPass02!` |
| Admin   | `mock_staff_03` | `MockPass03!` |

Open `/order`, sign in, and submit a test order. QR tracking needs an HTTPS app
address; configure `TRACKING_BASE_URL` for that address. `/o/example` provides a
labelled screen preview while database settings are absent. SQL regression
fixtures in `supabase/tests/` roll back their changes and should run only against
the local test database.

For phone testing, both `TRACKING_BASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` must
use the computer's Wi-Fi address, never `localhost` or `127.0.0.1`. Use HTTPS on
port 3000 for the app and port 54321 for the database API. Create a local
certificate that includes the Wi-Fi address, then enable `[api.tls]` and its
certificate paths in the ignored `supabase/config.toml`. The prepared checkout
uses ignored `certificates/localhost.pem` and `localhost-key.pem` files. No
certificate was installed into the computer's trust store.

For local HTTPS, add `--hostname` with the hostname from `TRACKING_BASE_URL`
when running the following command (required for Wi-Fi development assets).
The `--experimental-https-ca` option lets the app verify the local database's
certificate without disabling TLS verification:

```bash
npx next dev -p 3000 --experimental-https --experimental-https-key certificates/localhost-key.pem --experimental-https-cert certificates/localhost.pem --experimental-https-ca certificates/localhost.pem
```

Open the app's `/order` page, sign in with a test account, submit a new order,
then use **Open order status** beneath its QR. Old saved receipts retain their
previous URLs. Guest status refresh is manual until F8 is built.

The phone must share the Wi-Fi network and trust the test certificate for both
HTTPS ports. Firewall rules and Wi-Fi client isolation can still block access;
the setup does not change Windows network profiles or firewall rules. If the
computer's Wi-Fi address changes, update both environment URLs, the certificate
and the preview hostname. A hosted HTTPS test environment avoids these local
network and certificate requirements.

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

## Order tracking (F7)

Apply `supabase/migrations/20261107000000_order_tracking.sql` after the existing
migrations before using tracking. This replaces public order-ID lookup with
`guest_order_status(p_tracking_token)` and adds a distinct random token to each
order. Submission retries keep that token. Guest links use `/o/track#<token>`;
the fragment is private access and must not be logged or sent to analytics.

Successful counter submissions include a locally generated QR on the receipt.
Serve the app over HTTPS. Optionally set server-only `TRACKING_BASE_URL` to the
public HTTPS origin (also useful when the counter runs locally). Without a secure
address, the order still saves and the receipt explains that its QR is unavailable.
Existing browser receipts from before F7 have no QR; new submissions receive one.

Guests can refresh the confirmed status manually. F8 owns automatic updates and
alerts; collection QR is deferred. Without Supabase configuration, `/o/example`
shows labelled sample data; other links do not show sample orders.

Run `supabase/tests/order_tracking.sql` against a disposable migrated database to
check access restrictions, expiry and stable identities across retries/event days.
Links have no automatic expiry period; trusted maintenance can set
`orders.tracking_expires_at` to retire one. Personal-data cleanup remains F18's
responsibility and must fulfil the approved privacy notice.

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
