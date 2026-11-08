# F20: Collection Scanner

Module: 2. Barista Queue (collection)
User Role: Customer, Barista
Author: Henry336

## 1. Overview

A laptop at the pickup point faces the customers and runs `/scan`, signed in as staff. When a customer shows the QR on their tracking page to the webcam, the order is marked Collected and the screen turns green. The barista's "Mark collected" button on `/queue` stays as the fallback for customers without a QR and for anything the scanner cannot confirm.

## 2. Functional Requirements

| ID   | Requirement                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1  | The guest tracking page shows a QR of its own tracking link while the order is not yet collected or cancelled. The QR is drawn on the phone, so it works offline.    |
| FR2  | `/scan` needs a staff sign-in (barista, counter or admin), like the other staff screens.                                                                             |
| FR3  | The scanner reads the guest's tracking QR (or the receipt QR) from the webcam. Any other QR is ignored.                                                              |
| FR4  | A scan marks the order Collected only if it is Ready. An order that is already Collected counts as a success.                                                        |
| FR5  | Green screen with a tick, "#N Name" and "Enjoy your drink" when collected. Amber screen with "!" when the order is not ready, cancelled, unknown or not confirmable. |
| FR6  | The result shows for about 3 seconds, then the screen returns to black and white. The same code is ignored for 5 seconds after a scan.                               |
| FR7  | While online, the scanner keeps a local copy of today's Ready orders, refreshed every few seconds. It stores only a hash of each tracking code, never the code.      |
| FR8  | While offline, a scan whose code is in the local copy shows green and is saved on the laptop. A code not in the copy shows amber and asks for the barista.           |
| FR9  | Saved scans survive a reload and are sent automatically once back online. Sending the same scan twice is safe.                                                       |
| FR10 | A saved scan the server rejects (for example, the order was never Ready) moves to a "Needs review" list on `/scan` for staff to check and dismiss.                   |
| FR11 | Colour is never the only signal: every result also has a symbol and text.                                                                                            |
| FR12 | Scanner and "Mark collected" on the same order never conflict: whichever comes second sees "already collected".                                                      |

Known limit: an order marked Ready while the scanner is offline is not in its local copy, so that customer is sent to the barista.

## 3. Acceptance Criteria

- Scanning a Ready order's QR marks it Collected and shows green.
- Scanning a Queued or Preparing order shows amber "Not ready yet" and changes nothing.
- Scanning the same Collected order again shows green.
- Offline, a code from the local copy shows green; after reconnecting, the order becomes Collected on the server.
- Offline, an unknown code shows amber and is not saved.
- A saved scan the server rejects appears under "Needs review".
- A signed-out visitor cannot use `/scan` or its API.
- Tested with a real phone and the booth laptop webcam before the dry run.
