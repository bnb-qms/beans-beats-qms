# F16 validation guide

## Prerequisites

Use a disposable database with all merged migrations, including F4/F5 status routes, an active barista login, a second staff login, and a browser supporting IndexedDB/service workers. Configure local environment from `.env.example`. Use separate browser profiles or devices to simulate concurrent work. Install the selected Dexie version during implementation; verify its browser support and lockfile change. Do not use production order or personal data for tests.

## Automated checks

Run focused Vitest and any new SQL rollback tests after each change. Before push run, in order:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Record actual results. Do not mark an unavailable check as passed. See [contract](contracts/offline-sync.md) and [data model](data-model.md) for exact fields and state transitions.

## End-to-end scenarios

1. Sign in online, visit queue/order/menu/board, then disconnect. Reload each visited route. The queue/menu show their last confirmed state and an offline indicator; the board stays on its last confirmed list. A never visited screen may report unavailable. An API response must not be served from the worker cache.
2. In the offline queue, advance queued → preparing → ready → collected, reload and reopen the app, then reconnect. Check pending count, ordered replay, server version, one acknowledged update per tap, removal from pending storage and eventual cross-device visibility.
3. Change the same order on another device before reconnecting. Check 409, visible server/local states, retained action and explicit review; no automatic overwrite or dropped later action. Test both retry and discard paths.
4. Create and POS-confirm an order offline, including a permitted option and optional mobile consent. Reload, reconnect and verify one server order and actual pickup number. Interrupt a response after the server commits, then retry: `client_request_id` must yield the same receipt, one queue entry and one report total.
5. Change price or mark an item unavailable on another device before reconnect. Confirm the pending order remains stored, no silent repricing, a clear POS reconciliation instruction and no false pickup number. Confirm authorized manual recovery preserves or deliberately replaces the request ID only after review.
6. Sign out with pending work, sign in as another staff user, and expire/revoke the original session. Verify private records are locked, uploads stop on 401/403, and the original user can recover pending work only after online reauthentication with an eligible role.
7. Simulate IndexedDB quota/write failure, prolonged network failure, tab closure during sync and multiple open tabs. Verify staff receive an error and no “saved” confirmation before durable persistence; pending records survive failures and are not replayed concurrently from tabs.
8. Confirm the ready board and guest status do not show offline local changes until server acknowledgment. Confirm admin menu writes, reports and reset remain unavailable offline.

## Delivery

Follow the commit checkpoints in [tasks](tasks.md). Commit each verified coherent change separately with SE-EDU subjects. Push only after all five checks pass, then open one PR into `main` with `Closes #14` and wait for green CI.
