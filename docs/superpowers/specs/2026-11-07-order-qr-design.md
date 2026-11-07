# F7: Order tracking via QR

Approved scope: F7 supplies a private tracking URL and QR on F1's saved-order
confirmation screen. Guests see only pickup number, event date and confirmed
status without signing in. Collection QR and F8 polling/alerts are deferred.
The privacy notice describes first name and optional consented mobile, order
fulfilment/follow-up, deletion within 30 days after the event ends on 29 November,
and counter staff as the contact, as approved in chat.

## Approach

Use a separate database-generated 256-bit random token for each order. Keep the
token in the URL fragment (`/o/track#<token>`) so page requests do not send it to
hosting logs. The browser sends it only in the Supabase RPC request body. Replace
the public UUID lookup with a token lookup returning just number, date and status.
An optional database expiry permits links to be retired without reusing them;
no automatic expiry period is introduced. Submission retries return the same
receipt and tracking identity. Existing orders receive distinct tokens too.

Using pickup numbers would mix event days; using internal IDs would retain the
old public lookup and expose a client-generated submission identity. External QR
services would disclose the private link. Generate the QR locally on the server
using a QR encoder dependency; no installed dependency provides this capability.

## Implementation and validation

1. Add a migration with token defaults, expiry, restricted guest RPC and receipt
   token. Keep existing staff role and submission validation unchanged.
2. Add HTTPS URL and QR generation to successful counter submissions, with a
   separate warning if QR setup fails so a saved order is never reported failed.
3. Build the guest page with explicit refresh, neutral unavailable and retry
   states, privacy notice, safe-area padding and accessible status text. Only the
   explicit example route may show labelled sample data without Supabase config.
4. Test token validation, privacy response boundaries, QR payload, retries,
   expiry, same-number orders across days and database permissions. Run the five
   repository checks and SQL tests if a disposable database is available.

Offline submission is already disabled by the agreed project decision. Never
generate a link for an unconfirmed draft. F16 integration remains with F16.
