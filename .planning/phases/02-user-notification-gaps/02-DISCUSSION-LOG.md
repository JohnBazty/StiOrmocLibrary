# Phase 2: User notification gaps - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-19
**Phase:** 02-user-notification-gaps
**Areas discussed:** Wording and priority, Printing paused text, Return notice details, Where each notice opens

---

## Wording and priority

| Option | Description | Selected |
|--------|-------------|----------|
| Overdue hand-back Urgent | Highest priority | |
| Overdue hand-back Important | Same level as fines and lost-book notices | ✓ |
| Claude's table for the rest | Returned/in-library started/resumed Normal; clearance, reminder, paused Important | ✓ |

**User's choice:** "1. is important", then "yes to all" for the rest of the table.
**Notes:** User asked what the overdue hand-back is; explained in-library use and the Review sweep before deciding.

---

## Printing paused text

| Option | Description | Selected |
|--------|-------------|----------|
| Include public unavailable reason when typed | Already shown on the student printing page | ✓ |
| Never include a reason | Generic text only | |

**User's choice:** Asked for a suggestion, then accepted it ("yes to all").

---

## Return notice details

| Option | Description | Selected |
|--------|-------------|----------|
| One notice per book | Matches per-loan dedupe and Borrow confirmed | ✓ |
| One combined notice | Needs a batch concept the desk does not have | |
| Mention condition only when not Good | Short normal notices | ✓ |

**User's choice:** "yes", then asked for suggestions, then "add your suggestions on number 3".

---

## Where each notice opens

| Option | Description | Selected |
|--------|-------------|----------|
| Role-based paths (borrowing, my-books, clearance, printing) | Faculty printing to notifications because /faculty/printing does not exist | ✓ |

**User's choice:** Asked for a suggestion, then "yes to all".

---

## Claude's Discretion

- trigger_type / source_type values and dedupe key formats
- Shared helper vs inline SQL
- Staff path for in-library notices if Staff can hold in-library uses

## Deferred Ideas

- Fix existing Faculty print notices that link to the missing /faculty/printing route
