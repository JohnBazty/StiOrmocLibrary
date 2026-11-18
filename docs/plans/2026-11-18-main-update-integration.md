# Integrate latest library updates into main

## Why

Publish current local library updates while preserving the 67 commits already added to GitHub main.

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** built

## How

Commit existing local updates, merge origin/main without rewriting history, reconcile overlapping changes, and push the resulting merge to main. Temporary logs and deployment downloads in tmp/ stay local.

Preserve main's Postgres-only database boundary, book register and lookup tools, unsaved-change guards, and durable job runner. Adapt local maintenance, activity alerts, revenue reports, and catalog availability to the current database types. Keep local catalog filters, device sign-in, live refresh, cover images, printing controls, and circulation shortcuts. Retain startup connection retries alongside main's job scheduling.

Migration files are versioned only; this task applies no database migrations. The current tracker remains Postgres 037 applied / next unused 038; pending and reserved entries remain governed by .cursor/agent-protocol.md.

## Implementation tracking

- [x] Preserve local updates in commit ddd21c4.
- [x] Integrate origin/main and resolve conflicts.
- [x] Restore maintenance migration 030 schema documentation alongside current main records.
- [x] API and frontend type checks pass.
- [x] API suite: 496 tests pass.
- [x] Frontend suite: 88 files, 373 tests pass.
- [x] Production build passes; Vite reports its existing large-chunk advisory.

Push status is verified against the remote after this merge commit is created.

## Change log

- 2026-11-18: Integrated local updates with origin/main. The original local API suite passed 416/417; the import error involved the retired MySQL test environment and is resolved by main's Postgres implementation. Main's API tests read local enrollment settings, so verification explicitly sets ENROLLMENT_ROSTER_ENABLED=false for enrollment-independent fixtures. Updated stock-export assertions for migration 030's structured quantity/unit view and narrowed the historic reservation-notice assertion to distinguish new deduplicated Librarian operations alerts. No borrower eligibility rule was weakened.
