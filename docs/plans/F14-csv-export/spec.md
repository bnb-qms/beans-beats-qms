# F14 CSV Export — planning story map

Source: [feature specification](../../specs/F14-csv-export.md), [team decisions](../../decisions.md), story 33 in [user stories](../../user-stories.md). Issue #12; owner Win.

## US1 — Export a selected day's sales (P1 / source High)

As an admin, download daily sales records to compare with the organiser's POS.

Acceptance: authenticated active admins only; select a Singapore creation date; one row per order line across all submitted statuses; use recorded base and option prices; clearly mark cancelled rows but exclude them from summary cups and sales; totals match F13 for the same database state; open in common spreadsheets; export retained history after reset; make no data changes and disclose no customer personal data.

Owner confirmed on 7 Nov 2026: include cancelled rows but exclude them from totals; use order ID, pickup number, Singapore creation time, status, drink name, quantity, recorded base price, recorded option charges, unit total and line total, followed by daily cups and sales totals. No unresolved product decisions remain.

Independent test: two non-cancelled lines, 2 × (S$8 + S$1) and 1 × S$5, plus a cancelled S$6 line, yield all three detail rows and a summary of 3 cups / S$23.00. Unauthorized requests fail, later menu edits leave amounts unchanged, and exports do not mutate data.
