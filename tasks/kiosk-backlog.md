# Kiosk Feature Backlog

Features to add to the self-service kiosk (`/kiosk`), in priority order. Each
one reuses an endpoint the API already has, so the work is mostly kiosk UI —
no database or API changes unless noted.

Related: [SPEC-kiosk.md](../SPEC-kiosk.md) · [docs/kiosk-security.md](../docs/kiosk-security.md) · [plan.md](plan.md)

---

## 1. Pick up a reserved book

**Why:** Students reserve books online, but today only a librarian can hand
them over. This closes the reserve → pick up loop at the kiosk.

**Reuses:**
- `deskCirculationApi.borrower(payload, 'TakeHome')` already returns the
  student's `requests` (reservation id, title, status, assigned copy barcode,
  shelf, pickup deadline).
- `deskCirculationApi.preview(...)` and `.checkout(...)` already accept a
  `reservationId`; the server checks the scanned copy is the one assigned to
  that reservation (`DESK_REQUEST_COPY_MISMATCH` otherwise).

**Flow:** scan QR → if the student has books ready for pickup, show them with
their shelf location → student picks one → scans that copy's barcode → confirm
→ checkout with the `reservationId`.

**Acceptance:**
- [ ] Ready-for-pickup reservations show after the QR scan, with title and shelf.
- [ ] Scanning the wrong copy shows the server's mismatch message and lets the student rescan.
- [ ] A student with no reservations goes straight to the normal borrow flow.

**Effort:** small (BorrowFlow only).

## 2. Show the student's photo when borrowing

**Why:** The attendance QR is permanent and can be photographed. Showing the
account photo on the borrow screen makes borrowing on someone else's QR obvious
to the student and to staff nearby.

**Reuses:** `borrower()` already returns `user.photoUrl` (a short-lived signed
URL, approved photos only).

**Acceptance:**
- [ ] The borrow confirm screen shows the photo next to the name when one exists.
- [ ] No photo → the name alone, no broken image.

**Effort:** very small. Pairs naturally with #1.

## 3. Live seat availability on the home screen

**Why:** Visitors see at a glance whether there is room ("38 of 60 seats free").

**Reuses:** `attendanceApi.capacity()` → `GET /api/v1/admin/attendance/capacity`
(allowed for Staff) returns `current`, `capacity`, `available`, `overCapacity`.

**Acceptance:**
- [ ] Home screen shows seats free; refreshes every minute and after each check-in/out.
- [ ] Full library shows a clear "Library is full" message.
- [ ] If the call fails, the line is hidden — never an error on the home screen.

**Effort:** small.

## 4. "Read here" vs "Take home"

**Why:** Theses and reference books can't go home but can be read in the
library. Today that needs the librarian.

**Reuses:** desk `checkout` with `mode: 'InLibrary'` already creates an
in-library use with a hand-back time.

**Notes:** the server requires the student to be **checked in** (an attendance
visit today) and a hand-back time configured for the day; it blocks in-library
use for titles with a waiting queue. Surface those blockers as-is.

**Acceptance:**
- [ ] Borrow flow offers "Take home" / "Read here"; reading-only material offers only "Read here".
- [ ] Success screen shows the hand-back time.
- [ ] Not checked in → clear message pointing to Attendance.

**Effort:** small–medium.

---

## Not now (and why)

| Idea | Reason |
|---|---|
| My loans / fines / due dates | Needs student-level access the desk API doesn't give, and on a shared screen anyone with a photo of someone's QR would see that person's loans and fines. |
| Returns | Decided: the librarian scans returns at the desk. |
| Renewals | Being built on the separate `feat/renewal-management` branch; revisit after it merges. |
| Today's events / announcements | Only worth it if the library posts them regularly. |

## Before any of these ship

- [ ] Merge `fix/attendance-qr-rehash` (attendance QR self-heal).
- [ ] Deploy over HTTPS and follow [docs/kiosk-security.md](../docs/kiosk-security.md).
- [ ] Test on the real tablet (camera, long-press staff exit).
