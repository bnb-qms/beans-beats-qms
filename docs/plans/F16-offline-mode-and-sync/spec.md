# F16 planning story map

The authoritative requirements are [F16](../../specs/F16-offline-mode-and-sync.md), with [team decisions](../../decisions.md) taking precedence. Owner Win resolved the offline order-entry conflict on 7 Nov 2026: allow locally saved new orders and automatic submission after reconnection. This map does not replace the feature spec.

Issue #14, owner Win. Source stories 38–43 and the F16 acceptance criteria map to:

- **US1 (P1):** As a previously authenticated barista, reopen the cached queue and view previously loaded orders during an outage. Covers FR1–4, FR13, and the offline indicator. A fresh or signed-out user cannot open protected cached data.
- **US2 (P1):** As a barista, change a cached order from queued through preparing, ready and collected while offline, then synchronize without losing or silently overwriting work. Covers FR5–10 and source stories 39–41, 43, 59–60. Depends on US1 and F4/F5.
- **US3 (P1):** As a barista taking POS payment, save a new order locally during an outage and submit it automatically when reconnected, without duplicates or a false pickup number. Covers FR11–12, FR16 and source stories 42–43. Depends on the shared offline storage and session gate, not on US2.
- **US4 (P2):** As a viewer, see previously loaded screens and menu while disconnected, with the ready board frozen at its last confirmed state. Covers FR13–16 and existing F9 board behavior. Depends on US1's cache infrastructure.

The F16 spec's “customers cannot make orders” does not introduce customer ordering: only staff enter orders in this app.
