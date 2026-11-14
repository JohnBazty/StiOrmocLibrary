# Public home and catalog reference appearance

## Why
Restore the owner's friend-ui appearance on the public home/catalog while keeping the current circulation-audit branch's features and controls.

## Date created
2026-11-13

## Date last updated
2026-11-13

## Status
built

## How
- Work on local branch `codex/public-home-reference`, based on `fix/circulation-audit-remediation` commit `08da5c9`.
- Use `StiOrmocLibrary-friend-ui` as the visual reference: Poppins, lighter blue, charcoal dark surfaces, original logo and photographic library hero.
- Scope the reference styling through `.public-library-reference`; new Tailwind color tokens fall back to the original colors outside that wrapper. Signed-in embedded catalogs retain their existing cover component.
- Add a public-only full-title/author fallback cover. Real uploaded cover images remain preferred and recover after a failed image source changes.
- Keep category shortcuts, all existing collection/category/program/course/resource filters, search, pagination, device restoration, detail drawers and borrow/reserve destinations. Do not introduce the older folder's filter/API behavior as a side effect of copying appearance.
- Original comparison remains at http://localhost:5173. UI working copy runs at http://127.0.0.1:5174. Private local environment and launcher setup are separate from this UI change.
- No backend, database, dependency or authentication source changes. No migrations, commits, pushes or remote branch operations were performed for this UI slice.

## Implementation tracking
- [x] Owner confirmed appearance and scope before implementation.
- [x] Reference logo/hero, scoped font/palette and cover presentation applied.
- [x] Regression tests cover real-image retention/failure recovery and public-versus-embedded cover isolation.
- [x] Full tests and typecheck passed.
- [x] Browser search, category filtering, details, dark-mode contrast and mobile menu verified.
- [x] Final production build and coverage verification recorded.

## Verification notes
- Full suite: 506 API tests and 296 web tests passed.
- The pre-existing auth controller test expects WEB_ORIGIN=http://localhost:5173. Tests run with that process-only environment value; the UI app retains its ignored http://127.0.0.1:5174 setting. The first full run exposed this fixture assumption; no test expectations or backend source were modified to suppress it.
- Browser confirmed Poppins, the reference assets, full-title fallback covers, valid book details and a category result count changing from 1,650 to 254 for Information Technology.
- Desktop and narrow layout were inspected. The browser's zoom produced a reported narrow inner width of 355 CSS pixels; document width was 346, with no horizontal document overflow. This is not a physical-device certification.
- Dark-mode header resolves to the reference charcoal rgb(34,35,46); the hero search retains a white background and blue input text.
- The original comparison checkout has no tracked changes. Backend, migration and dependency diffs in the UI checkout are empty.

## Change log
- 2026-11-13: Applied the first appearance-only slice after owner confirmation. Research/thesis-specific covers, signed-in shells and other screens remain separate follow-up work.

- Final checks: production build and full coverage command passed. Web statement coverage reports 57.82%; passing the command does not claim the entire repository reaches 80%.


## Detail cover and authentication follow-up — 2026-11-13
- Owner requested reference proportions in the public book drawer and reference branding/colors on both popup and full-page Student/Faculty login and registration forms.
- Public detail cover now uses the reference's centered `w-48` portrait frame (192 by 256 CSS pixels, measured in the browser), instead of a full-width `h-72` frame. Embedded signed-in catalog behavior remains unchanged.
- PublicAuthLayout now has its own reference theme scope because the native dialog is a sibling of the catalog. Replaced the generic library icon with the existing reference logo and Online Library label.
- Updated presentation classes in LoginPage, RegistrationPage, RosterRegistrationForm and DeviceSwitchPrompt to inherit reference color tokens. Full-page branding uses the logo/library photo. Authentication handlers, device verification, roster registration, busy guards, focus management and dismissal behavior were retained.
- Existing registration unavailability remains unchanged in this local setup; no signup policy or provider configuration was altered.
- Verification: 298 web tests passed, including popup busy/dismissal/navigation checks and full-page logo regressions; typecheck and production build passed. Browser verified cover ratio, light login branding, Sign Up tab, Poppins and blue text, and charcoal dark dialog background. Full-page forms were checked through component tests; the current router normally opens the public popup variants.
- No backend, migrations, secrets or original-comparison source changes; nothing committed or pushed.

## Staff login reference — 2026-11-13
- Owner requested the friend-ui staff-login appearance and chose to keep the current labels.
- Applied the reference's two-column form/photo layout, Poppins, logo, light gray form surface, blue photographic panel and dark charcoal treatment to AdminLoginPage.
- Preserved the existing personnel heading, Log In button, staff-specific password-reset destination and user-login navigation. Retained both password visibility controls, all validation, role handling, device restoration/switching and redirect logic; only the render section/imported decorative icons changed.
- Regression assertions check reference logos, password-reset destination and visibility controls. Browser verified both controls and the desktop layout; narrow viewport was 390 CSS pixels with document width 390 (no horizontal overflow).
- Private preview saved outside the repository. No API/database or baseline-comparison source changes; no push or commit.
- Final staff checks: 298 web tests passed; typecheck and production build passed. Staff page and API health returned HTTP 200. Browser verified charcoal input surfaces in dark mode and the 390-pixel layout without overflow.
