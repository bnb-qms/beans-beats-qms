# System design

Copied from the "System Design" tab of the team's Project Tables sheet on 6 Nov 2026. This was the design before coding started. Where it differs from the merged schema ([`supabase/migrations/`](../supabase/migrations/), [`architecture.md`](architecture.md)) or a later team decision ([`decisions.md`](decisions.md)), the newer one wins. The main differences are listed at the end.

Staff enter orders; customers track progress and present a QR code to collect their drinks. The app must support unreliable wifi and sync saved changes after reconnecting.

## Users

| User                         | What they need to do                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Cashier / order-taking staff | Enter drinks, quantities, options and the customer's first name; see the total; take payment through the separate POS; provide the tracking QR. |
| Barista / preparation staff  | See the queue and drink details; mark orders as Making and Ready.                                                                               |
| Collection staff             | Scan the customer's collection QR and complete the pickup. May be the same person as the cashier or barista.                                    |
| Customer                     | Order at the counter, pay, scan the tracking QR, follow progress and present the collection QR. No customer account.                            |
| Admin / booth lead           | Manage the menu and availability, view reports, export data and manage event-day operations.                                                    |

The exact staffing arrangement still needs confirmation. Customers order through a cashier; they use the website only to track their order.

## Menu and pricing

| Drink      | Base price |
| ---------- | ---------- |
| Espresso   | S$3        |
| Latte      | S$8        |
| Flat white | S$8        |
| Americano  | S$6        |
| Pourover   | S$10       |

- Iced adds S$1. Oat milk adds S$1.
- Temperature: hot or iced.
- Milk: regular or oat where applicable.
- Espresso and black drinks have no milk choice.

## Proposed flow

Cashier enters order → app calculates total → customer pays through POS → cashier confirms payment in our app → order enters preparation queue → customer scans tracking QR → barista prepares drinks → customer presents collection QR → staff confirm collection.

The cashier manually enters the total into the POS. Our app does not verify the POS transaction.

## Statuses

| Status                      | Meaning and next action                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Awaiting payment (proposed) | Order entered but not released for preparation. Cashier confirms successful payment or cancels. |
| Received                    | Accepted into the queue; barista can start preparation.                                         |
| Making                      | Preparation started; barista can mark Ready.                                                    |
| Ready                       | Available for pickup; appears on the ready board.                                               |
| Collected                   | Handover completed; removed from the ready board.                                               |
| Cancelled (proposed)        | Will not be fulfilled; kept in history with a reason.                                           |

## Possible data model

| Record                 | Main fields                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| EventDay               | id, date, isOpen                                                                                                                |
| Order                  | id, eventDayId, pickupNumber, firstName, status, totalCents, version, creation/update times, payment confirmation time/staff ID |
| OrderItem              | id, orderId, menuItemId, quantity, selected options, recorded drink name, base price and surcharges                             |
| MenuItem               | id, name, basePriceCents, allowed options/surcharges, availability, active/inactive flag, version                               |
| Staff                  | id, authentication reference, role                                                                                              |
| OrderEvent             | id, orderId, action, previous/new state, staff/device ID, timestamp and correction/cancellation reason                          |
| OrderAccess            | order reference, protected tracking/collection tokens, expiry and redemption state                                              |
| PendingAction (device) | unique actionId, target order, action data, expected version and sync state                                                     |

## Integration contracts

| Action                            | Information exchanged                                                       | Key rule                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Create order                      | First name, items, quantities, options → saved order, total and identifiers | Validate selections and prices; repeated submission must not create duplicates.          |
| Confirm payment                   | Order ID and staff confirmation → release to preparation queue              | Authorised staff only; does not verify the POS payment.                                  |
| Update preparation status         | Order ID and requested change → latest saved status                         | Validate transitions; outdated updates must not silently reverse newer ones.             |
| Update guest page and ready board | Order changes → relevant status/display information                         | Guests see their order; the public board receives only public display details.           |
| Scan collection QR                | Token and staff action → order validation and collection outcome            | Handle invalid and already-redeemed codes; agree whether final confirmation is required. |
| Change menu                       | Updated prices/options/availability → saved menu and refreshed screens      | Admin only; preserve historical order prices.                                            |
| Synchronise offline work          | Pending actions → acknowledgements, conflicts and latest state              | Keep unsent changes through reloads; prevent duplicates and resolve conflicts.           |
| Report / export / new event day   | Selected date → totals and CSV; new date → new operational day              | Agree what counts in totals and keep past records.                                       |

The POS handoff is a staff process, not an API integration. CSV reconciliation depends on the report the organiser can provide.

## Tech choices

| Choice              | Tech                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| Frontend            | Next.js                                                                      |
| Backend             | Next.js Route Handlers + Supabase                                            |
| Database            | Supabase Postgres                                                            |
| Offline storage     | IndexedDB + service-worker caching                                           |
| Live updates        | Supabase Realtime for staff screens and board; short polling for guest pages |
| Deployment          | Vercel                                                                       |
| Collection hardware | Existing staff tablet + booth display                                        |

## Where the merged code differs

- **No "Awaiting payment" or "Confirm payment" step.** Staff submit only after payment, and a submitted order goes straight into the queue (see [decisions](decisions.md)).
- **Statuses in the schema** are `queued`, `preparing`, `ready`, `collected`, `cancelled`.
- **No EventDay table.** `event_day` is the Singapore date, set automatically, and order numbers restart each day.
- **Prices are stored in dollars** (`numeric(10,2)`), not cents.
- **No OrderEvent or OrderAccess tables yet.** The guest page uses the order's own ID.
- **Staff login** is still being decided (see [decisions](decisions.md#open-questions)).
- **The public cannot subscribe to the orders table,** so the ready board polls instead of using Realtime.
