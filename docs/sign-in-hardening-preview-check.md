# Sign-in hardening: preview check for John (PR #19)

**For:** John, or the AI agent working for him. **Asked by:** Ethan, 2026-11-11.

Ethan cannot deploy a Vercel preview of this branch, because the `sti-ormoc-smart-library` Vercel project lives on John's account and adding Ethan would need a plan upgrade. Please deploy a preview from John's account, run the checks below, and write the results back here.

## What is already done

- Branch `feat/sign-in-hardening`, draft PR https://github.com/JohnBazty/StiOrmocLibrary/pull/19. Plan and design: [sign-in-hardening-plan.md](sign-in-hardening-plan.md).
- Migration `036_sign_in_hardening.sql` is **already applied** on the live Supabase database (2026-11-11). Do not run it again. It adds only `accounts.must_change_password` (default `false`), and the current production code ignores it.
- Type checks and unit tests pass (API 399, web 281), but only on fake databases. Nobody has tried it in a real browser yet. That is what this check is for.
- The branch needs **no new Vercel environment variables**.

## Steps for the agent

1. Check out the branch: `git fetch origin && git checkout feat/sign-in-hardening && git pull`.
2. Deploy a **preview**, never production: `npx vercel@65.14.0 deploy` (no `--prod`). Use the existing `sti-ormoc-smart-library` project. Run `vercel link` first if the checkout is not linked yet.
3. Open `<preview-url>/api/health`. It must report a ready schema, not `migration_required`. Preview deployments use Vercel Deployment Protection, so open the link while signed in to Vercel, or use a share link.
4. Note which database the preview uses. Its `DATABASE_URL` is most likely the live Supabase. If so, every sign-in below creates real sign-in records, so use test accounts only.
5. Run the browser checks below and fill in the results table.

## Browser checks

Use **test accounts only**: one Student and one Staff/Admin. Never use a real student's account for the lockout or temporary-password checks.

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Student sign-in | Sign in as the test Student | Dashboard opens |
| 2 | Staff sign-in | Sign in as the test Staff or Admin | Staff workspace opens |
| 3 | Sign-in key is hidden | DevTools > Application > Session Storage | Only user details and a CSRF token are there. No JWT or "token" value. Cookies show an `HttpOnly` sign-in cookie |
| 4 | Saving works | Do one ordinary save, for example edit and save a profile field | Saves with no 401, 403 or "CSRF" error |
| 5 | New tab | While signed in, open the site in a second tab | Still signed in, and a save works there too |
| 6 | Sign-out | Sign out, then reload the page | Stays signed out |
| 7 | Lockout | On the **test Student**: 5 wrong passwords | 5th try says sign-in is paused for 15 minutes; the right password is refused too |
| 8 | Staff unlock | As Admin, unlock the test Student | The test Student can sign in again at once |
| 9 | Temporary password | As Admin, set a temporary password for the test Student | The password is shown once |
| 10 | Forced change | Sign in as the test Student with the temporary password | A "change your password" form appears; nothing else works until the password is changed; after changing, the dashboard opens |

## Results (fill in)

Preview URL: _____ · Deployment id: _____ · Database used: _____ · Tested by / date: _____

| # | Pass / Fail | Note (screenshot file, error text) |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |

When done, commit this file on `feat/sign-in-hardening` (or paste the table as a PR #19 comment), and tell Ethan. Do not merge the PR as part of this check. Never write passwords, sign-in keys, or students' personal details into this file or the PR.
