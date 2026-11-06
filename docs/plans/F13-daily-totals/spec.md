# F13 planning story map

The authoritative requirements are [F13](../../specs/F13-daily-totals.md), with [team decisions](../../decisions.md) taking precedence. This file maps those requirements for task generation; it is not a replacement spec.

Owner: Win. Issue: #11. Both source stories are High priority, mapped to P1.

- **US1 (P1), source story 31:** As an admin, view cups recorded for a selected Singapore date to monitor sales volume. Includes authentication, date selection, zero totals, all non-cancelled preparation states, and historical access.
- **US2 (P1), source story 32:** As an admin, view recorded sales in SGD for that date to reconcile revenue. Includes option charges and historical price preservation. Builds on US1's shared report.

Owner clarification, 6 Nov 2026: exclude cancelled orders, following existing SQL. Submitted queued, preparing, ready and collected orders count; drafts and cancelled orders do not. Cancellation can change an earlier day's totals; menu price changes cannot.

FR coverage: US1 owns FR1–3, FR5, FR7–9; US2 owns FR4, FR6, FR10 and shares FR8–9.
