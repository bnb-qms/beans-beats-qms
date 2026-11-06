# Features

Copied from the "Feature List" tab of the team's Project Tables sheet on 6 Nov 2026, with build status as of 6 Nov 21:30. Each feature has a spec in [`specs/`](specs/) and an issue on the [project board](https://github.com/orgs/bnb-qms/projects/1).

| ID  | Issue | Feature                     | Module           | User stories | Owner | Spec                                            | Status                                   |
| --- | ----- | --------------------------- | ---------------- | ------------ | ----- | ----------------------------------------------- | ---------------------------------------- |
| F1  | #1    | Counter order entry         | 1. Order screen  | none yet     | Bella | [F01](specs/F01-counter-order-entry.md)         | Done (#23)                               |
| F4  | #2    | Order queue                 | 2. Barista queue | 1, 2         | Pooj  | [F04](specs/F04-order-queue.md)                 | Implemented; database validation pending |
| F5  | #3    | One-tap status updates      | 2. Barista queue | 3, 4, 21     | Pooj  | [F05](specs/F05-one-tap-status-updates.md)      | Not started                              |
| F6  | #4    | Live queue updates          | 2. Barista queue | 5            | Pooj  | [F06](specs/F06-live-queue-updates.md)          | Not started                              |
| F7  | #5    | Order tracking via QR       | 3. Guest page    | 15, 18       | TL    | [F07](specs/F07-order-tracking-via-qr.md)       | Not started                              |
| F8  | #6    | Live status and ready alert | 3. Guest page    | 16, 17       | TL    | [F08](specs/F08-live-status-and-ready-alert.md) | Not started                              |
| F9  | #7    | Ready board                 | 4. Ready board   | 20, 22       | Henry | [F09](specs/F09-ready-board.md)                 | Done (#20), sample data until DB linked  |
| F10 | #8    | Price changes               | 5. Menu controls | 25, 28       | Bella | [F10](specs/F10-price-changes.md)               | Done (#27)                               |
| F11 | #9    | Sold-out toggle             | 5. Menu controls | 26, 27, 28   | Bella | [F11](specs/F11-sold-out-toggle.md)             | Done (#27)                               |
| F12 | #10   | Deactivate menu items       | 5. Menu controls | 29, 28       | Bella | [F12](specs/F12-deactivate-menu-items.md)       | Done (#27), plus reactivation            |
| F13 | #11   | Daily totals                | 6. Daily report  | 31, 32       | Win   | [F13](specs/F13-daily-totals.md)                | Not started                              |
| F14 | #12   | CSV export                  | 6. Daily report  | 33           | Win   | [F14](specs/F14-csv-export.md)                  | Not started                              |
| F15 | #13   | Price snapshot per order    | 6. Daily report  | 37           | Win   | Part of F1 (see [decisions](decisions.md))      | Done inside F1                           |
| F16 | #14   | Offline mode and sync       | All              | 38-43        | Win   | [F16](specs/F16-offline-mode-and-sync.md)       | Not started                              |
| F17 | #15   | Staff logins                | All              | 44.1, 44.2   | TL    | [F17](specs/F17-staff-logins.md)                | Partly: sign-in built in F1 (#23)        |
| F18 | #16   | Personal data handling      | All              | 55-58        | Henry | [F18](specs/F18-personal-data-handling.md)      | Partly: name and mobile rules in F1      |
| F19 | #17   | Reset between event days    | All              | 49, 50       | Henry | [F19](specs/F19-reset-between-event-days.md)    | Not started                              |

Out of scope:

- **F2 Customer self-ordering.** The owner confirmed (27 Oct) that staff key in every order at the counter.
- **F3 Payment via the organiser's POS.** A staff process, not something we build. Our order screen shows the total clearly; the POS person keys it in.

## Notes from the sheet

- **F1:** Order details are entered only in our app; the POS only gets the total (owner, 27 Oct). Price = item price + options (iced +S$1, oat milk +S$1).
- **F6:** Medium in the stories, but the queue is not usable during a rush without it.
- **F8:** Medium in the stories, but the brief requires live status and a ready alert.
- **F10:** WIP menu (27 Oct): espresso S$3, latte S$8, flat white S$8, americano S$6, pourover S$10.
- **F12:** Adding items (23), renaming (24) and milk/temperature options (30) are Medium.
- **F13:** The booth lead tallies these totals against the POS totals at the end of each day.
- **F14:** The POS records only totals, so our app is the only record of drinks sold. The CSV columns still need to be confirmed with the organisers.
- **F16, F18:** Hard requirements from the brief.
- **F17:** Test logins for judges are part of the required live-link deliverable.
- **F19:** The README must explain resetting between event days. The event runs 26-29 Nov (media day plus 3 public days), with a barista dry run in the week of 16 Nov.
