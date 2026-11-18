# Personnel forgot-password label

- Why: owner requested “Forgot password” as the label and Vercel hosting afterward.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built

## How

Change the personnel login recovery link from “Forgot password / Set up account” to “Forgot password”. Preserve its `/forgot-password?portal=staff` destination and recovery behavior. Package only this label and the existing authentication regression test over verified production dpl_7WBBZRooGHzhq8UWpk1wzRCLnpVw. No database or settings changes.

## Implementation tracking

- [x] Change label in active checkout and isolated production snapshot.
- [x] Observe regression assertion fail before changing the label.
- [x] Complete authentication tests and Vercel build.
- [x] Verify and promote candidate, then check canonical staff page.

## Change log

- 2026-11-18: Owner authorized label-only change and Vercel deployment. Isolated snapshot preserves all latest hosted changes.

- 2026-11-18: Authentication tests 7/7 and web typecheck passed. First candidate failed on an unsupported test option, fixed before the next successful build. A concurrent production update changed the baseline to dpl_2JM5Xt6136VnvsEa9oE2mwTzhoQH; downloaded and preserved its source archive, changing only the requested label. Owner requested immediate hosting and will perform manual testing. Final Vercel build pending.

- 2026-11-18: Vercel dpl_EkoEDGSBMzQU2qJs55m3FFtC4T6Y is READY and live at https://sti-ormoc-smart-library.vercel.app. Canonical staff page and its referenced built AdminLoginPage chunk verified with the new label. Manual testing remains with the owner as requested. No database changes or Git push.
