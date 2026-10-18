# Self-Service Kiosk — Security Recommendations

The kiosk (`/kiosk`) runs on a shared tablet in the library. It stays signed in
as a library desk account so students can log attendance and borrow books
without a librarian. That convenience has a cost: a desk-level sign-in lives on
a public device. These steps keep that safe.

Related: [SPEC-kiosk.md](../SPEC-kiosk.md).

## 1. Use a dedicated kiosk account

Create one account only for the kiosk. Do **not** sign the kiosk in with a
personal librarian account or `ADMIN-PORTAL-001`.

```bash
npm run auth:create-user -w @sti-library/api -- --email kiosk@ormoc.sti.edu.ph --role "Library Staff" --id KIOSK-001 --name "Library Kiosk"
```

- **Role `Library Staff`.** It has `desk.operate` (attendance scans and desk
  borrowing) but not `library.manage` or `accounts.manage`. If the kiosk's
  sign-in leaks, it cannot change policies, accounts or the catalog.
- **No email-code (OTP) login on this account.** The kiosk sign-in screen and
  the staff exit panel cannot enter a one-time code.
- **Strong, unique password,** known only to librarians.

## 2. Lock the tablet to the kiosk

Students must not be able to leave the kiosk page, open the address bar, or
open developer tools.

| Tablet | How |
|---|---|
| Android | A kiosk-browser app (e.g. Fully Kiosk Browser) locked to the kiosk URL with an exit PIN. Free but weaker: Settings → Security → App pinning, with "Ask for PIN before unpinning". |
| iPad | Settings → Accessibility → Guided Access (set a passcode). Add the kiosk URL to the Home Screen from Safari, open it, triple-click the side button → Start. |
| Windows | Settings → Accounts → Other users → Set up a kiosk → Microsoft Edge → "As a digital sign or interactive display" → kiosk URL. |

Also:

- Turn off auto-lock/sleep and keep the tablet on a charger.
- Mount the tablet so it cannot be carried away.
- Grant camera permission to the kiosk site **before** locking it down.

## 3. Serve the kiosk over HTTPS

Browsers only allow the camera on HTTPS (or `localhost`). Over plain
`http://<computer-ip>:5173` the scanner will not start. HTTPS also protects the
kiosk's sign-in token on the network.

## 4. The kiosk stays signed in

The server signs people out after 10 minutes without activity. The kiosk is an
exception on purpose: while signed in it renews its session every 4 minutes
(`POST /api/v1/auth/activity`), so it is ready for the next student.

This is why sections 1–3 matter: the kiosk's token never goes idle, so the
account must have little power and the device must be locked down.

If the server refuses a renewal (account disabled, session revoked), the kiosk
goes to its sign-in screen and shows "This kiosk was signed out. Please ask a
librarian to sign it in."

## 5. Ending the kiosk session (staff only)

There is no visible sign-out button. To end the session:

1. On the home screen, **press and hold "Welcome to the library" for 3 seconds**.
2. Enter a librarian's or library staff member's Staff ID and password.

- Share this gesture with staff only.
- A wrong password keeps the kiosk signed in.
- Each attempt is a real login, so repeated wrong guesses count against the
  server's login rate limit. Watch for repeated failed logins from the kiosk.

## 6. What the kiosk keeps

- The kiosk stores **no student data**. Students are identified only by their
  attendance QR; each screen resets to home after 60 seconds without a tap
  (with an "Are you still there?" warning 20 seconds before).
- The kiosk's own sign-in token is kept in the browser's storage on the tablet.
  That is why the browser must be locked (section 2).

## 7. Keep `ATTENDANCE_QR_SECRET` stable

Attendance QR codes are signed with `ATTENDANCE_QR_SECRET` in `apps/api/.env`.

- **Never change it casually.** Changing it makes every student's existing QR
  invalid ("This attendance QR code is invalid or no longer recognized").
- Never commit it or share it.
- If it must change: with the self-heal fix (branch `fix/attendance-qr-rehash`)
  deployed, each pass is re-issued automatically the next time the student opens
  it. Without that fix, revoke the old credentials and have students reopen their
  pass:

  ```sql
  UPDATE attendance_qr_credentials
     SET credential_status = 'Revoked', revoked_at = NOW(), updated_at = NOW()
   WHERE credential_status = 'Active';
  ```

## 8. If the tablet is lost or stolen

1. **Deactivate the kiosk account** in the account management screens. The
   server then rejects its token on the next request.
2. Change the kiosk account's password before re-activating it on a new tablet.
3. Check recent desk activity (attendance and borrowing) for anything unusual.

## Checklist

- [ ] Dedicated `Library Staff` kiosk account, no OTP, strong password
- [ ] Tablet locked to the kiosk URL (kiosk browser / Guided Access / assigned access)
- [ ] Served over HTTPS; camera permission granted
- [ ] Auto-lock off, tablet mounted and charging
- [ ] Staff know the 3-second hold to end the session
- [ ] `ATTENDANCE_QR_SECRET` set, stable, and not committed
