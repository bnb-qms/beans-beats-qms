# Team decisions

What the team has agreed, newest first, with where it was agreed. When a spec and this file disagree, this file wins; flag it so the spec gets updated. Open questions are at the end. Do not build on an open question without asking the owner.

## Agreed

| Date   | Decision                                                                                                                                                                         | Where                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 6 Nov  | Supabase schema merged (PR #19). Order numbers restart each Singapore day. Statuses are `queued` → `preparing` → `ready` → `collected`, or `cancelled` before collection.        | PR #19                                     |
| 6 Nov  | Each order line copies its drink name and price, and each add-on copies its price, so menu changes never change past totals.                                                     | PR #19                                     |
| 6 Nov  | Removed items (`is_active = false`) are hidden; sold-out items (`is_available = false`) are shown as sold out. Oat milk cannot go on espresso, americano or pourover.            | PR #19                                     |
| 4 Nov  | **No "Payment received" step.** Staff key in the order, take payment on the organiser's POS, then press Submit. A submitted order goes straight to the barista queue.            | Group chat (Henry, Win), call with Bella   |
| 4 Nov  | **Stock is checked on every item added or removed.** If a drink or option is unavailable, Submit is greyed out. Staff toggle in stock / out of stock manually on the admin page. | Group chat (Henry after call with Bella)   |
| 4 Nov  | One staff role covers taking orders and making drinks ("barista"). Admin (booth lead) is separate.                                                                               | Group chat (Bella, Win)                    |
| 4 Nov  | Customers do not see a menu in the app; the menu is shown to staff on the order screen (F1). The booth will likely have a physical menu board.                                   | Group chat (Bella, Win)                    |
| 4 Nov  | Make it work first, then make it stand out.                                                                                                                                      | Group chat (Win)                           |
| 3 Nov  | F15 (price snapshot) is a requirement of F1 and the data model, not a separate feature.                                                                                          | Group chat and sheet comments (Win, Bella) |
| 2 Nov  | Stack: Next.js, Supabase (Postgres, Realtime), Vercel. Offline storage with IndexedDB and a service worker.                                                                      | System Design tab                          |
| 2 Nov  | Workflow: one branch per feature, AI agents write tests and document changes, PR into `main`, Henry and Win review and merge. `main` needs a PR and green CI.                    | Meeting notes 2 Nov                        |
| 27 Oct | Payment is PayNow or card on the organiser's POS. No cash, no POS integration. The POS person keys in only our total, so our app is the only record of drinks sold.              | Owner (Aden)                               |
| 27 Oct | Staff enter every order at the counter. No customer self-ordering (F2 out of scope).                                                                                             | Owner (Aden)                               |
| 27 Oct | Menu: espresso S$3, latte S$8, flat white S$8, americano S$6, pourover S$10. Iced +S$1, oat milk +S$1.                                                                           | Owner (Aden), System Design tab            |

## Hard requirements (from the brief)

- Runs in a browser on tablets and guests' phones. No app to download, no customer account.
- Works offline on patchy hall wifi and syncs later.
- First name only; mobile optional, handled under PDPA.
- Payments stay on the organiser's POS.

Deliverables and dates are in [`overview.md`](overview.md).

## Open questions

| Question                                                                                                                                     | Who decides   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Can the cashier take new orders while offline? F16 FR11 says no; F1 proposes per-device prefixes (A001, B001) and holding orders until sync. | Win, Bella    |
| How do staff log in: Supabase's built-in login, or the username/password table in the schema?                                                | TL (F17), Win |
| Who shows the tracking QR (F1 confirmation screen or F7), and do we keep a separate collection QR?                                           | Bella, TL     |
| Story 30 (admin manages milk and temperature options): F1 treats it as deferred.                                                             | Bella         |
| Do we collect mobile numbers at all? No feature uses them yet.                                                                               | Henry (F18)   |
| Which columns the organisers need in the CSV export.                                                                                         | Win (F14)     |
