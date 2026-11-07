# Beans&Beats Queue

Order and pickup system for the Beans&Beats booth at Christmas Together 2026 (Hall F, Marina Bay Sands, 26 to 29 Nov).

|                             |                                    |
| --------------------------- | ---------------------------------- |
| **Live app**                | https://beans-beats-qms.vercel.app |
| **Demo video**              | _to be added_                      |
| **Technical summary (PDF)** | _to be added_                      |
| **Test logins**             | [below](#test-logins)              |

## Test logins

Shared staff accounts for judges and testing staff screens on the [demo site](https://beans-beats-qms.vercel.app) and PR previews. Open a staff screen, enter either account below, and use **Sign out** before changing roles:

| Role    | Username          | Password                 | Can do                                                     |
| ------- | ----------------- | ------------------------ | ---------------------------------------------------------- |
| Admin   | `preview-admin`   | `local-preview-password` | Everything, including prices, deactivating drinks, reports |
| Barista | `preview-barista` | `local-preview-password` | Take orders, update the queue, mark items sold out         |

These are public test accounts. Change both passwords before the event (26 Nov), and never use them for real staff.

Both roles can open `/order`, `/queue` and `/menu`. Baristas can change
availability only; prices and deactivation require admin. `/report` and its CSV
export require admin, including direct API requests. The queue currently shows
a signed-in placeholder until F4–F6 are implemented. `/board` and guest tracking
links remain public.

### Staff sessions (F17)

The agreed implementation uses pre-provisioned usernames and bcrypt passwords,
with a signed, HttpOnly 12-hour cookie; it supersedes the original F17 proposal
for Supabase Auth email/password. There is no public registration. The legacy
`counter` role remains supported as required by the existing schema. Staff
identity, active status and role are checked on the server for every protected
request. Removing or disabling a staff record denies its next request.

Signing out hides protected screens and notifies other open staff tabs. Returning
to a hidden tab, using Back, or reconnecting hides the workspace until the server
rechecks access. A rejected session returns to sign-in. Order drafts and uncertain
submissions remain in per-account browser session storage; signing back in as the
same account in that tab restores them. A different account never loads that
account's saved draft. Closing the tab or clearing browser storage can remove it.
Sign-in and confirmed sign-out require a working connection; a failed sign-out
shows an error and must be retried before handing over the device.

F16's persistent offline queue, cached access and conflict recovery are not built
yet. No new offline session is granted. Reconnection checks access before
remounting operational screens; submissions stay online-only. F19 owns event-day
reset. These dependencies remain outstanding acceptance checks for the full F17
offline/event-day workflow.

### Demo data and reset

Use representative sample orders only with these public accounts. Before storing
live event data, move the demonstration to a separate Supabase project and point
its deployment/PR-preview environment at that demo project. Provision demo staff
through trusted SQL as described below; never copy live staff credentials or
customer records into the demo. The current shared team database is not proof of
demo/live isolation.

For a disposable **local** demo, follow Local test database setup below, then run
`npx supabase db reset --local` to reload migrations and representative mock data.
This deletes local demo edits and orders and restores the documented mock logins.
Never run it against live data. There is no hosted reset screen yet: ask the booth
lead to restore sample data in the isolated demo database. Do not reset the shared
hosted database as part of testing staff logins.

Login/session regression checks are in `src/app/api/staff/session/route.test.ts`
and `src/components/staff-workspace.test.tsx`. Run
`supabase/tests/staff_logins.sql` only against a disposable migrated database;
it checks credential verification, disabled accounts, throttling and permissions
and rolls back its fixtures.

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
previous URLs. Guest status updates automatically every 3 seconds while the page
is visible and connected; **Refresh status** also requests the latest state.

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

The team's hosted project (`beans-beats-qms`) has every migration applied, recorded in Supabase's migration history under shortened names, so check `supabase migration list` before using `db push` against it. When a PR adds a migration, apply it to the hosted project after merging.

Staff accounts live in `public.staff` with a salted bcrypt hash in `password_hash` (for example `extensions.crypt('a-password', extensions.gen_salt('bf'))`), never plaintext. Staff sign in through the app's server (`/api/staff/session`, `src/lib/staff-server.ts`), which uses the secret key in `SUPABASE_SERVICE_ROLE_KEY` and a signed cookie made with `STAFF_SESSION_SECRET`. Never put either in the browser or a `NEXT_PUBLIC_` variable. The shared test accounts are under [Test logins](#test-logins).

`supabase/insert_mock_data.sql` is for a disposable test database only. Its 20 `mock_staff_*` accounts have public passwords; on the hosted project they are switched off.

Staff actions go through server-only database functions that take the signed-in staff ID: `counter_submit_order` (orders), `counter_edit_menu` (prices, sold out, deactivate), `report_daily_totals` and `report_csv_export`. The public guest page and ready board use `guest_order_status` and `ready_orders`, which never return mobile numbers. Win's original `create_order`, `update_order_status` and `daily_sales` are switched off. See [`docs/building.md`](docs/building.md) for how to add new ones.

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

F8 polls the protected status read every 3 seconds while visible. Ready shows a
persistent pickup message containing the order number. Repeated Ready responses
do not reannounce that message; Collected or Cancelled removes the pickup prompt.
During connection failures, the last confirmed order stays visible with a
reconnecting notice and last-update time. Failed requests back off up to 30
seconds; returning to the page or reconnecting triggers an immediate check.
No sound, SMS, notification permission or locked-phone delivery is required.
Collection QR remains deferred. Without Supabase configuration, `/o/example`
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

The app starts a new event day by itself at midnight Singapore time. There is no reset button and nothing is deleted. This replaces the "Start new day" button in the F19 spec (see `docs/decisions.md`, 7 Nov).

- Every order belongs to the Singapore date the server receives it on. Pickup numbers start again from 1 each day.
- The barista queue (`/queue`) and ready board (`/board`) only load today's orders, so after a fresh load each morning both are empty.
- Earlier days stay in the reports: pick the date in Daily Totals or the CSV export (`/report`, admin only).

A screen that lost its connection keeps showing the orders it last loaded, even across midnight, and the queue still accepts offline status taps on them. So it only clears once it is back online and has refreshed.

At the end of each event day (26-29 Nov), the booth lead:

1. Checks `/queue` for anything still Queued, Preparing or Ready, and marks collected drinks as collected. Anything left over drops off the queue and board at midnight but still counts in that day's totals.
2. Opens `/order` on each booth device and checks that no orders show "Pending sync" or "Needs review". An offline order that only syncs after midnight is counted on the new day.
3. Downloads that day's CSV from `/report` as a backup.
4. Uses **Sign out** on every staff device.

Before opening the next morning, the booth lead connects every booth device to the internet, reloads `/queue` and `/board`, and checks that both show no orders, the queue shows no "Offline" or "pending sync" status, and the board shows no "Reconnecting…" note.

## Personal data clean-up (F18)

Guest first names and mobile numbers must be deleted within 30 days after the event ends on 29 Nov 2026, as the privacy notice on the guest page says. Sales records stay, without personal data.

An offline order is dated the day it reaches the server, so a 29 Nov order that syncs late can be dated 30 Nov or later. Run the clean-up only after every device has sent its orders, and erase up to yesterday rather than up to 29 Nov.

Between 30 Nov and 29 Dec 2026, Win or Henry:

1. Opens `/order` on every booth device while online and checks that nothing shows "Pending sync" or "Needs review". Resolve any that do.
2. Clears the app's site data on every booth device (browser settings, site data), so no device still holds drafts or offline orders that could sync later.
3. Runs this once in the Supabase SQL Editor for the team project:

```sql
select public.erase_guest_details((now() at time zone 'Asia/Singapore')::date - 1);
```

It replaces every name up to and including yesterday (Singapore time) with "Guest", removes mobile numbers and consent times, and returns how many orders it changed. That covers all event days and any late-synced orders. Running it again changes nothing, and it refuses to touch the current Singapore day. Daily totals and CSV exports stay the same.
