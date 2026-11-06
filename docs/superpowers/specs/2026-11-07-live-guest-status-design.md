# F8: Live status and ready alert

Implement F8 on `feature/order-qr` as requested, reusing F7's token-protected
`guest_order_status` RPC, status labels and privacy boundary. No database change
or new dependency is needed. Collection QR stays deferred.

## Approach

Use the project's documented 3-second guest polling interval (the F8 spec's
5 seconds is a proposed review target). A single cancellable request followed by
a timeout avoids overlapping requests. Stop requests while hidden or offline,
fetch immediately on visibility/connection recovery, and cap failure backoff at
30 seconds. Bound each request to 10 seconds. Dispose timers, requests and event
listeners on unmount or order-link changes, ignoring obsolete responses.

Keep last-confirmed data during transient failures, with a reconnecting notice
and last-successful timestamp. Invalid or expired tokens clear the order and
stop requests until the link changes. Repeated identical order data keeps its
identity. Only status content belongs in the atomic live region; changing
timestamps and connection notices stay outside it, so normal polls do not
reannounce readiness. Ready includes the pickup number and booth instructions;
Collected and Cancelled remove the ready presentation. No inferred progress,
sound, SMS or notification permissions are introduced.

Realtime subscriptions are disallowed by the public database permissions. Manual
refresh alone does not meet F8. Polling the existing read-only RPC is sufficient.

## Scope and validation

- Replace F7's one-shot fetch with a small guest-specific polling controller and
  connect it to the existing component and Refresh status button.
- Use the installed Vitest fake timers and browser-event fakes to cover normal
  progress, repeated Ready, corrections, failure backoff, recovery after missed
  states, visibility, invalid access, link changes and cleanup. Verify the live
  region and stale timestamp presentation without adding a DOM dependency.
- Update the feature list and setup docs; run all five repository checks.
- Commit and push on the same branch. Close issue #6 only after implementation
  and validation are complete. Keep Windows network/firewall settings unchanged.
