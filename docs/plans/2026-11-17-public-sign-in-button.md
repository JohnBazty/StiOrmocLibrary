# Restore the public Sign In button

- Why: the public header replaced Sign In with My workspace whenever a remembered account role existed. On phones Sign In was also hidden in the menu.
- Date created: 2026-11-17
- Date last updated: 2026-11-17
- Status: built
- Branch: fix/public-sign-in-button
- Authorization: owner reported the missing button after the hosted release; repair and hosting continue that release authorization. No GitHub push.

## How

Keep one direct Sign In link visible in the public header on every screen size, regardless of a remembered role. Retain the desktop workspace shortcut and the existing mobile menu. Preserve catalog continuation and normal session/authentication behavior; do not silently sign users out. No schema or API change. Migration baseline remains 058, next unused 059.

## Implementation tracking

- [x] Reproduce both causes through four failing regression cases.
- [x] Make the header link independent of the remembered role and desktop-only container.
- [x] Focused catalog/login tests and typecheck.
- [x] Verify browser appearance, full web suite and production build.
- [x] Host, verify canonical assets and record the release.

## Change log

- 2026-11-17: Owner reported Sign In disappearing and supplied a screenshot showing My workspace. Confirmed conditional rendering, rather than assuming expired authentication. Sixteen focused tests pass after the fix.

## Verification and release

- Full frontend suite: 560 tests passed in 127 files with two workers. Sixteen focused catalog/login tests passed. Typecheck and full production build passed.
- Browser verified the direct header link at 360px without body overflow and opened the actual login dialog. Regression cases cover anonymous, Student, Faculty and Librarian header states.
- Candidate health/schema were healthy/ready. Promoted `dpl_7h9ChpJFViWw3W3xjNyZX45DHc6z` to https://sti-ormoc-smart-library.vercel.app.
- One runtime file changed: PublicCatalogWelcome.tsx. The deployed package preserves the completed Phase 5/6 release. No database change, account sign-out or GitHub push.
- Combined correctness/accessibility/security review: the link retains the existing login destination and catalog-return state, is keyboard accessible and outside the desktop-only container. Authentication still checks the existing session normally.

- 2026-11-17: Repair built, browser verified and hosted. Source SHA-256: 02d7bbfed63b89306cf2d8b5d694aa44a1237a52b0b65ed8c63f5b1642b888b6.
