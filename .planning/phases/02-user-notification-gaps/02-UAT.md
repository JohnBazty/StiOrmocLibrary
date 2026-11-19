---
status: testing
phase: 02-user-notification-gaps
source: [02-VERIFICATION.md]
started: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

## Current Test

number: 1
name: Concurrent identical printing saves send one set of notices
expected: |
  On a real Postgres (not production), with at least one user holding an open print request,
  two librarians save the same "paused" printing state at the same moment
  (two simultaneous PATCH /printing/service-status calls). Exactly one set of
  "Printing paused" notices is written; the second save sees no real switch and sends none.
awaiting: user response

## Tests

### 1. Concurrent identical printing saves send one set of notices
expected: Two simultaneous identical pause saves on a real Postgres produce exactly one "Printing paused" notice per user with an open print request.
result: [pending]

### 2. Overdue in-library notice wording threatens no penalty
expected: The overdue notice reads "<title> was due back at the library desk by <time>. Please return it to the library desk." (or "The item you used was due back…" when the title is missing) and names no fine, penalty, suspension or block.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
