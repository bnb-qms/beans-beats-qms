# How to build a feature here

Read this with your feature's spec. It shows how to plug into what is already built, so every feature works the same way. The working example is F1 (`src/app/order/`, `src/app/api/counter/`, `supabase/migrations/20261106010000_counter_orders.sql`) and F10-F12 (`src/app/menu/`).

## Before you start

1. Read your spec in `specs/`, then [`decisions.md`](decisions.md). Decisions win over specs.
2. Check [`features.md`](features.md) for what is already built, and [`dependencies.md`](dependencies.md) for what your feature needs.
3. Branch from the latest `main`: `git switch main && git pull && git switch -c <issue>-<short-name>`.

## Staff pages (order, queue, menu, report, reset)

- Wrap the page in `StaffWorkspace` from `src/components/staff-workspace.tsx`. It shows the sign-in form and passes you the signed-in `staff` (`id`, `username`, `role`):

  ```tsx
  "use client";
  import { StaffWorkspace } from "@/components/staff-workspace";
  export default function QueuePage() {
    return (
      <StaffWorkspace>{(staff) => <Queue staff={staff} />}</StaffWorkspace>
    );
  }
  ```

- Call your own API routes with `requestJson()` from the same file. It sends JSON, and if the session has ended it brings the sign-in form back.
- Roles are `barista` (takes orders and makes drinks), `admin` (booth lead), and the older `counter`. Check the role on the server, never only in the page.

## Test logins

Sign in to staff screens with the shared test accounts in the [README](../README.md#test-logins): `preview-admin` (admin) and `preview-barista` (barista). Test every staff feature as both roles: a barista must be refused anything admin-only (prices, deactivating drinks, reports). Never create new accounts or change these passwords from code.

## API routes (all staff reads and writes)

Put routes under `src/app/api/<area>/<thing>/route.ts`. Use the helpers in `src/lib/staff-server.ts`, as `src/app/api/counter/orders/route.ts` does:

```ts
import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

export async function POST(request: Request) {
  try {
    checkOrigin(request); // writes only
    const staff = await requireStaff(); // 401 if not signed in
    const input = await body(request); // JSON, size-limited
    // validate input here, then:
    const { data, error } = await database().rpc("queue_update_status", {
      p_staff_id: staff.id /* ... */,
    });
    if (error)
      throw new HttpError(409, "Plain message saying what to do next.");
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
```

- `database()` uses the server-only secret key and bypasses all table permissions. Only call it in route files, never in a page or `"use client"` file.
- Never trust the role, staff ID or prices from the request body. The server supplies `staff.id`; the database checks the role.

## Database changes

- **Add a new file** in `supabase/migrations/` named `YYYYMMDDHHMMSS_<what>.sql`. Never edit a migration that is already on `main`.
- **Staff actions go through a `security definer` function** that takes `p_staff_id`, checks that staff row is active and has the right role, and is executable by `service_role` only. Copy the shape of `counter_submit_order` or `counter_edit_menu`:

  ```sql
  create function public.queue_update_status(p_staff_id uuid, p_order_id uuid, p_expected_version integer, p_status text)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  begin
    if not exists (select 1 from public.staff where id = p_staff_id and is_active and role in ('barista', 'admin')) then
      raise exception 'BB_FORBIDDEN';
    end if;
    -- ...
  end;
  $$;
  revoke all on function public.queue_update_status(uuid, uuid, integer, text) from public, anon, authenticated;
  grant execute on function public.queue_update_status(uuid, uuid, integer, text) to service_role;
  ```

- **Do not use** Win's original `create_order`, `update_order_status` or `daily_sales`. They rely on Supabase's built-in login, which we do not use, so they are switched off. Reuse their logic (status transitions, `version` checks, totals) inside new `p_staff_id` functions.
- Raise short codes (`BB_FORBIDDEN`, `BB_INVALID`, `BB_CONFLICT`) and turn them into plain messages in the route.
- Status changes must check `version` so an old update cannot overwrite a newer one. Statuses: `queued` → `preparing` → `ready` → `collected`, or `cancelled` before collection.

## Public pages (guest page, ready board)

- No sign-in. Use the browser client from `src/lib/supabase/client.ts` and the public functions only: `guest_order_status(p_tracking_token)` and `ready_orders()`. The old order-ID lookup is removed by F7. Tracking links use `/o/track#<token>`; keep credentials in the fragment and RPC body, never query strings or logs.
- The public cannot read tables directly or subscribe to Realtime on `orders`, so poll every 3 seconds, as `src/app/board/ready-board.tsx` does.
- Never show mobile numbers or other customers' details on a public page.

## Look

- Follow [`design.md`](design.md): design tokens (`bg-panel`, `text-muted`, `numeral`, `min-h-tap`...) and `Button` from `src/components/button.tsx`. No raw Tailwind colours like `zinc-500`.
- Copy pieces from `/design` (queue card, board tile, guest ready screen) instead of inventing new styles.

## When the database is not connected

Until the Supabase keys are in the environment, staff routes answer "Staff service is not configured". For public pages, show sample data when `NEXT_PUBLIC_SUPABASE_URL` is missing, with a visible "Sample data" label, as the ready board does. Mark it with a `// shortcut:` comment so it is easy to remove.

## Before you open a PR

- Add tests for new logic (`*.test.ts` next to the file), and a SQL test in `supabase/tests/` for new database functions, as F1 does.
- Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run build`.
- Commit in SE-EDU style. Open a PR into `main` with `Closes #<issue>`. Reviewers: Henry and Win.
- If your PR depends on another open PR, say so in the description instead of basing your branch on theirs; stacked PRs got closed by mistake once already.
