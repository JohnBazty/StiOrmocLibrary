# Dynamic attendance QR

Sources: [docs/maps/dynamic-attendance-qr.md](../maps/dynamic-attendance-qr.md); Final Draft (Objectives, Limitations, Scope, Mobile app module). Reference only, clean-room.
Status: draft (awaiting Ethan's approval)

## Purpose

Give every library user a QR code that changes every 30 seconds and works once, so a screenshot or photo of someone's code cannot be used to enter in their name. The phone must be able to show a valid code with no internet. The desk scanner stays online. The permanent pass keeps working, as the Final Draft requires.

## Actors & permissions

- **Student, Faculty, Admin (as visitor):** view their own rotating code on the attendance pass page. Only their own seed is ever sent to them.
- **Admin (the Librarian), at the desk:** scans codes to check visitors in and out (existing `scan/*` routes, Admin only). Changes the static-pass setting.
- **Library Staff:** same desk scanning once that role exists; no setting changes.

## Entities

- `attendance_qr_credentials` (existing): add `last_totp_step BIGINT NULL`, the newest time step already used for check-in or check-out. **New column.**
- Seed (not stored): derived on the server from `ATTENDANCE_QR_SECRET`, the credential's `public_id`, `user_id` and `credential_version`. Reissuing the pass changes the seed. **New, derived.**
- Dynamic payload (new): `STILIB.ATTENDANCE.2.<publicId>.<step>.<code>`. `step` is the 30-second time step; `code` is a keyed hash of `publicId` and `step` with the seed, at least 128 bits, URL-safe.
- `attendance_logs.scan_method` (existing): new value `'Dynamic QR'`.
- `library_profile_settings` (existing): add `static_attendance_qr_allowed BOOLEAN NOT NULL DEFAULT TRUE`. **New column.**
- Changes to that setting are audited (actor, time, before/after, reason), as capacity changes are.

## Workflows

**Phone, while online (first visit or refresh)**
1. The user opens the attendance pass page.
2. The page receives their `publicId`, seed, the 30 s step length and the server time.
3. The page saves these for this user on the device, with the difference between the phone clock and the server clock.
4. It shows the rotating QR with a countdown to the next code. The permanent pass stays available under "Static ID pass".

**Phone, offline**
1. The user opens the cached pass page.
2. The page computes the current step from the phone clock plus the saved difference, makes the code and shows the QR.
3. If nothing is saved for this user (never opened online), it says "Open this page once while online to set up your rotating code".

**Desk (online)**
1. Staff scans the code. `scan/resolve` shows who it is and whether they are inside, **without using the code up**.
2. Staff picks the purpose and confirms. `scan/check-in` checks the code again and uses it up.
3. Check-out works the same with `scan/check-out`.

## Business rules

- **R1** The server accepts both payload versions: `.1` (permanent pass) and `.2` (rotating code).
- **R2** A `.2` code is valid only if its code matches the one the server computes for that `publicId` and `step`. The comparison takes constant time.
- **R3** A `.2` code is valid only if its step is within **1 step** of the server's current step (about 30 to 60 seconds of drift). OBSERVED default in authelia.
- **R4** Check-in and check-out refuse a `.2` code whose step is not greater than `last_totp_step`, and set `last_totp_step` to that step in the same transaction under the existing row lock. Each code is usable once (authelia reuse policy).
- **R5** `scan/resolve` never changes `last_totp_step`.
- **R6** A check-in retried with the same `request_id` returns the original result before any code check (existing idempotency), so network retries never fail as "reused".
- **R7** Reissuing the pass (new `public_id` or `credential_version`) makes every old rotating code invalid, offline copies included.
- **R8** A revoked pass or an inactive account refuses both payload versions (existing rules, now also for `.2`).
- **R9** When `static_attendance_qr_allowed` is false, a `.1` permanent pass from a **Student** is refused. Faculty and Admin are not affected.
- **R10** The seed is sent only to its own user, from `GET /api/v1/attendance/pass`, with `Cache-Control: no-store`. It never appears in a QR, a log line or an admin response.
- **R11** The phone deletes the saved seed when the user signs out, and replaces it when the server returns a different `publicId`.
- **R12** A successful `.2` scan stores `scan_method = 'Dynamic QR'`; a `.1` scan keeps `'Permanent QR'`.
- **R13** The phone and the server produce the same code for the same seed and step (one shared test vector in both test suites).

## Configuration

| Setting | Default | Who changes it |
| --- | --- | --- |
| Allow static pass for Students (`static_attendance_qr_allowed`) | on | Admin, with a reason (audited) |
| Step length | 30 s (fixed) | not configurable in v1 |
| Drift window | ±1 step (fixed) | not configurable in v1 |

## Edge cases & errors

| Code | Message | When |
| --- | --- | --- |
| `ATTENDANCE_QR_INVALID` | This attendance QR code is invalid or no longer recognized. | Bad format, wrong code, unknown or reissued pass |
| `ATTENDANCE_QR_EXPIRED` | This QR code has expired. Show the current code on your phone. | Step outside ±1 (R3). Usually a wrong phone clock. |
| `ATTENDANCE_QR_REUSED` | This QR code was already used. Wait for the next code. | R4, including check-out within 30 s of check-in |
| `ATTENDANCE_QR_STATIC_DISABLED` | Show the rotating code from your library pass page. | R9 |
| `ATTENDANCE_QR_REVOKED`, `ATTENDANCE_ACCOUNT_INACTIVE` | (existing) | R8 |

The precise reason for any failure is logged on the server without the payload or seed (authelia pattern).

## Security & privacy

- A copied seed lets the holder make valid codes, the same as any authenticator app. Reissuing the pass (R7) is the remedy, so the Librarian's existing reissue action must stay available.
- The seed is stored on the phone in browser storage for this site. Any script injected into the site could read it, so the existing XSS protections matter here. On-device encryption (Aegis vault) is out of scope for v1.
- No personal data in the QR (unchanged).

## Out of scope for v1

- An offline queue on the desk scanner (the Final Draft keeps the desk online).
- Device-bound key pairs (QRIdentity model). The Final Draft asks for TOTP.
- A room or kiosk showing a rotating code that students scan (Attendance-Tracker model).
- Using the rotating code to identify students at borrowing (circulation); separate spec later.
- The React Native app; this web page carries the feature until it exists.
- Settings for step length and drift window.

## Open questions (with recommended answers)

1. **Cache the pass page for true offline use?** This needs a service worker (QRIdentity pattern), for example `vite-plugin-pwa`, a new dependency. *Recommended: yes, limited to the pass page and its assets.*
2. **Keep the static pass allowed for Students by default?** *Recommended: yes (R9 switch defaults to on), so the rollout cannot lock anyone out.*
3. **Should Faculty also be bound by the static-pass switch?** *Recommended: no for v1.*
4. **Is ±1 step (about 30 to 60 s) enough drift?** *Recommended: yes, plus the saved clock difference. Revisit if desk staff report many "expired" scans.*
5. **Delete the unused demo page `StudentAttendancePage` as part of this work?** *Recommended: yes.*

## Acceptance criteria

- **R1** Given a valid permanent pass, when it is scanned, then check-in works as today. Given a valid rotating code, when it is scanned, then check-in works.
- **R2** Given a rotating code with one character changed, when it is scanned, then `ATTENDANCE_QR_INVALID`.
- **R3** Given a code for the current step minus 1 or plus 1, then it is accepted. Given minus 2 or plus 2, then `ATTENDANCE_QR_EXPIRED`.
- **R4** Given a code that checked a user in, when the same code is used to check out, then `ATTENDANCE_QR_REUSED`. Given an older step than the last used one, then `ATTENDANCE_QR_REUSED`.
- **R5** Given a code that was only resolved, when it is used to check in, then check-in succeeds.
- **R6** Given a check-in that succeeded, when the same request ID and code are sent again, then the original result returns with `duplicate: true`.
- **R7** Given a pass that was reissued, when a code made from the old seed is scanned, then `ATTENDANCE_QR_INVALID`.
- **R8** Given a revoked pass or an inactive account, when a rotating code is scanned, then `ATTENDANCE_QR_REVOKED` or `ATTENDANCE_ACCOUNT_INACTIVE`.
- **R9** Given the switch is off, when a Student's permanent pass is scanned, then `ATTENDANCE_QR_STATIC_DISABLED`; when a Faculty permanent pass is scanned, then check-in works. Given the switch changes, then an audit row records actor, before/after and reason.
- **R10** Given User A is signed in, when they call `GET /attendance/pass`, then only A's seed is returned and the response has `Cache-Control: no-store`. Admin attendance responses and logs contain no seed.
- **R11** Given a saved seed, when the user signs out, then it is gone from the device. Given the server returns a new `publicId`, then the saved seed is replaced.
- **R12** Given a rotating-code check-in, then the log row has `scan_method = 'Dynamic QR'`.
- **R13** Given the fixed test seed and step, then the API and the web helper return the same code.
- **Offline** Given the pass page was opened online once, when the phone has no connection, then the page opens and shows a code the desk accepts.

## Change log

- 2026-11-10: Draft written from the map.
