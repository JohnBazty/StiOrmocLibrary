# Due and overdue email notices

Why: in-app reminders alone do not reach borrowers who are not currently using the library site.

Date created: 2026-11-13

Date last updated: 2026-11-13

Status: planned

## How

Keep the existing 12-hour and 1-hour due reminders and first overdue in-app notice. Add approved email delivery to the same events through a durable outbox, and add configurable overdue-day levels after the Librarian confirms the intended days and repeat policy. Do not invent day levels or send a backlog immediately.

Use the existing operational runner, not a second timer. Compute level eligibility from the Manila library calendar and the loan's recorded due time. Each delivery key includes loan, renewal sequence or due-date version, channel and level. Record one successful delivery per key; retry transient failures with bounded backoff and preserve an error state for staff. Recheck that the loan remains outstanding before sending. A returned, renewed, confirmed-lost or archived notice follows an explicitly reviewed policy, never an obsolete cached due date.

Email contains the minimum needed: title, due date, instruction and authenticated library link. Use the verified registered school email; never expose another borrower's information or put sensitive credentials in messages or logs. A missing address is a visible delivery failure, not silent success. Borrowers retain their in-app reminder.

## Implementation tracking

- [ ] Confirm overdue day levels, send hours and existing overdue-loan rollout policy
- [ ] Inspect reusable request-email outbox/provider adapter; add a new migration only if required
- [ ] Versioned notice rules, email template and existing-runner integration
- [ ] Tests: each level once, retries, renewal/return race, Manila closed days, privacy and delivery failures
- [ ] Combined security/database review, all required checks and separate activation approval

## Change log

- 2026-11-13: Planned audit items 8 / roadmap email and day-level notices. Existing in-app reminders remain implemented; no real emails sent.
