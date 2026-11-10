# Map: dynamic (TOTP) attendance QR with offline generation

Mapped 2026-11-10 for the `reverse-feature` pipeline. Behavior only; no reference code copied.

## Requirement (Final Draft, `docs/source/Final-Draft.pdf`)

- Objectives: "dynamic, time-synchronized QR code verification for student identification" (circulation) and "a contactless, dynamic QR-based attendance monitoring feature that tracks student entry and exit, requires users to define their specific purpose of visit".
- Limitations: the system needs a continuous connection, "although the mobile application supports time-synchronized offline QR code generation for entry logging fallback".
- Scope: "dynamic, time-synchronized TOTP ... QR codes on the student mobile app, which allows secure offline check-in generation while preventing identity fraud through screenshot duplication".
- Mobile app module: the app "caches a dynamic, TOTP-encrypted student QR code locally to support time-synchronized offline entry logging".
- `docs/source-of-truth.md`: accept the dynamic QR **and** the static QR on the school ID.

Reading: the **phone** works offline; the desk scanner is online.

## Sources

| Source | Stars | License | Commit date | Why |
| --- | --- | --- | --- | --- |
| authelia/authelia | 29.6k | Apache-2.0 | 2026-11-10 | Mature server-side TOTP checking: drift window, replay history, error handling |
| beemdevelopment/Aegis | 13.5k | GPL-3.0 | 2026-09-06 | Phone generates codes offline from a stored secret |
| jeffreydivi/QRIdentity | 0 | MIT | 2024-04-15 | Rotating QR used as in-person ID, offline web page via service worker |
| founder-srm/Attendance-Tracker | 1 | none | 2026-07-25 | Rotating-QR attendance in React + Supabase (opposite direction) |

GPL and unlicensed sources: facts only, nothing copied.

## How each source does it

### authelia (server checks a code)
- Entry: the TOTP sign-in handler (`internal/handlers/handler_sign_totp.go`) loads the user's TOTP configuration, validates the code, then checks history.
- OBSERVED: defaults are 30 s period, 6 digits, SHA-1, **skew 1** (one step either side of now) (`internal/configuration/schema/totp.go:51-60`).
- OBSERVED: validation returns the matched **step**; the handler refuses a step already in the user's TOTP history and saves the step after success (`handler_sign_totp.go:148-168`). Each code is single-use.
- OBSERVED: every failure returns the same generic message to the client and logs the precise reason on the server.
- OBSERVED: a setting can turn the reuse policy off (`DisableReuseSecurityPolicy`); it is on by default.
- OBSERVED: stored secrets are encrypted at rest and can be rotated (storage encryption commands in docs).

### Aegis (phone makes the code)
- OBSERVED: code = HOTP of the secret with counter `floor(unixSeconds / period)` (`crypto/otp/TOTP.java:11-19`). Needs only the secret and the device clock, so it works offline.
- OBSERVED: secrets live in an encrypted on-device vault (`vault/`), unlocked by the user.

### QRIdentity (rotating QR as an ID)
- OBSERVED: on first use the page makes a device key pair and enrolls the public key with the server (`templates/client.html:56-70,133`). The private key, name and ID are kept in `localStorage` (`client.html:119-136`).
- OBSERVED: every 2 s the QR is regenerated from the current timestamp, signed with the device key (`client.html:83-89,145-149`).
- OBSERVED: the verifier checks the signature and that the timestamp is only a few seconds old (`templates/server.html:100-114`). No used-code history.
- OBSERVED: a service worker caches the page so it opens with no internet (`static/sw.js`, registered at `client.html:171-172`).
- OBSERVED: sign-out clears the stored key (`client.html:163-164`).

### Attendance-Tracker (room shows the code)
- OBSERVED: the server signs `{meeting, expiresAt, nonce}` with an HMAC secret that never reaches the browser (`src/lib/qr.ts:2-60`); an admin screen shows the rotating QR (`components/admin/QRDisplay.tsx`).
- OBSERVED: a signed-in member scans it; the server checks signature and expiry, then records attendance; duplicates fail on insert (`src/app/actions/attendance.ts:30-61`).
- INFERRED: the member's phone needs internet at scan time. Does not meet the offline requirement.

## Common pattern
1. A secret per person (or per device) the server can check against.
2. The code is derived from the current time step, so it changes every few seconds.
3. The server accepts a small clock window (authelia: ±1 step of 30 s).
4. Single use: the server remembers the used step (authelia) or keeps the window very short (QRIdentity).
5. Generic error to the user, detailed reason in server logs.
6. Offline: the phone keeps the secret locally and the page is cached by a service worker.

## StiOrmocLibrary today
- `apps/api/src/modules/attendance/attendance-credential.service.ts`: permanent pass `STILIB.ATTENDANCE.1.<publicId>.<secret>`; the secret is an HMAC of `ATTENDANCE_QR_SECRET` with `publicId:userId:version`; only its SHA-256 is stored (`attendance_qr_credentials.secret_hash`). Reissue bumps `credential_version`. Checks the account is Active.
- `attendance.service.ts`: `resolve` (preview), `checkIn` (request-ID idempotency, row locks, open-visit and capacity checks, notification), `checkOut`. `scan_method` is always `'Permanent QR'`.
- `attendance.routes.ts`: `scan/resolve`, `scan/check-in`, `scan/check-out` (Admin), `GET /attendance/pass` and `pass.png` (own user).
- Web: `features/attendance/UserAttendancePage.tsx` loads the pass and a server-rendered PNG; `AttendanceScannerModal.tsx` scans with `html5-qrcode`. No QR encoder in the web workspace, no service worker.
- Dead demo: `pages/student/StudentPages.tsx:156` `StudentAttendancePage` (fake "rotating demo code", not routed).
- Tables: `attendance_qr_credentials` (no TOTP or used-step column), `attendance_logs.scan_method TEXT`, `library_profile_settings`.

## Gaps
1. No time-based code: a screenshot of the pass is valid forever (Final Draft: "preventing identity fraud through screenshot duplication").
2. No single-use check (authelia pattern).
3. The phone cannot make a code offline: no locally kept seed, no on-device QR rendering, no cached app shell (Final Draft: "caches ... locally to support time-synchronized offline entry logging").
4. No way for the Librarian to require the rotating code over the static pass.
5. Circulation identity (borrowing) also expects the dynamic QR; out of this feature's scope.

## Unknowns
- Whether every student phone can open the web app as an installed or cached page (browser support, shared phones).
- How far student phone clocks drift while offline.
- Whether Faculty should also be required to use the rotating code.
- Whether the React Native app will replace the web pass page soon enough to skip the service worker.
