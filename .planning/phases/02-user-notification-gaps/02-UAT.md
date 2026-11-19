---
status: partial
phase: 02-user-notification-gaps
source: [02-VERIFICATION.md]
started: 2026-11-19T00:00:00Z
updated: 2026-11-19T02:37:12.622Z
---

## Current Test

[testing paused — 2 items outstanding]

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
