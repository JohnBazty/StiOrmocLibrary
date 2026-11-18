# Roadmap: StiOrmocLibrary

## Overview

Phases run through GSD at Ethan's request. Other work is tracked in `docs/roadmap.md` and `docs/plans/`.

## Phases

- [ ] **Phase 1: Reservation Maintenance** - Reservations tab on Maintenance: pickup window and waiting-list expiry

## Phase Details

### Phase 1: Reservation Maintenance
**Goal**: Librarians set the pickup window (1-7 days) and an optional waiting-list expiry from a Reservations tab on /librarian/maintenance.
**Depends on**: fix/reservation-hold-gaps (PR #44), which adds pickup-deadline.ts
**Requirements**: RES-MAINT-01, RES-MAINT-02
**Success Criteria** (what must be TRUE):
  1. A librarian changes the pickup window and the next Mark ready uses it.
  2. With waiting-list expiry set, waiting reservations past the limit expire and the student is told.
  3. With waiting-list expiry blank, no waiting reservation ever expires.
**Plans**: 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Migration 043 (written, not applied) and the Librarian-only reservation settings API (wave 1)
- [x] 01-02-PLAN.md — Mark ready uses the pickup window; waiting-list expiry job and notice; student "Expires on" (wave 2)
- [x] 01-03-PLAN.md — Reservations tab on Maintenance; Book queue wording (wave 2)
