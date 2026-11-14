# Signed-in dashboard reference styling — 2026-11-13

## Scope and review links

Working copy: `StiOrmocLibrary-ui-integration`, local branch `codex/public-home-reference`. No commit, push, merge or deployment.

- Updated: http://127.0.0.1:5174/librarian/dashboard
- Account overview: http://127.0.0.1:5174/librarian/accounts
- Original comparison: http://localhost:5173
- Appearance reference: http://localhost:5175

The existing reference logo, Poppins typography, lighter blue (#0b5ea2), dark sidebar (#132a3f), dark page (#14151b) and charcoal cards (#22232e) now apply to the signed-in shell and role dashboards. Helper text uses a stronger neutral blue for readability.

## Implementation boundaries

`PortalLayout.tsx` adds the reference logo and CSS scope. Dashboard content styling activates only on the Student, Faculty, Staff, Librarian and Admin `/dashboard` routes and the Librarian `/accounts` overview. The shared header, sidebar and account card retain all current interactions, role-specific links, permissions, notifications, theme control and sign-out error handling. No desktop collapse, header search or logout confirmation was introduced.

`portal-reference.css` adapts the existing utility colors and shared card presentation inside those scopes. Shared UI component defaults remain unchanged. Existing card/table structure, data loading, statistics, links, refresh behavior and responsive table behavior remain in use. Scheduled-job status and the permanent QR panel inherit this dashboard appearance without changing their code or API calls. QR images retain a white background.

`UserDashboardPage.tsx` uses the existing reference cover renderer for recommendations, current loan, reservation and history thumbnails. Uploaded images retain their full proportions; missing or failed images display full titles. Author text uses only available fields. Other signed-in catalog pages retain their original cover component.

The Google Fonts import now precedes Tailwind imports so the browser can load Poppins correctly. No packages were added. Public and authentication styling is retained.

No backend, schema, migration, environment, launcher, dependency or lockfile changes were made in this batch. The comparison and reference folders were not edited.

## Verification

- Role-navigation tests cover all five role variants, restricted Staff links, notification destinations, account overview, sign-out failure/retry and mobile inert/scroll/Escape behavior.
- Existing notification tests cover previews, mark-read, destination actions and inbox deletion.
- Dashboard tests cover real response fixtures, recommendations/cart actions, refresh preserving visible data, Faculty destinations, empty states and failed request/retry.
- Component checks retain all Staff task destinations and exercise QR loading, error guidance, image creation and URL cleanup. Scheduled-job tests cover loading, healthy/stale/failed statuses and independent failure handling.
- Browser: authenticated Librarian operations dashboard and account overview, desktop and 390px layouts, light/dark surfaces, notification overlay and keyboard Escape/focus restoration. At 390px, document content width was 382px (no horizontal overflow).
- Local scheduled jobs show Stale because the existing local timer is disabled; styling does not change job execution.
- Authenticated Student/Faculty and separate Staff browser sessions were not available. Their components and navigation were checked with test fixtures; no login bypass or replacement display data was introduced. Physical QR scanning was not tested.
- Screenshots remain outside the repository in the private local runtime directory: dashboard-light-preview.jpg, dashboard-dark-preview.jpg and dashboard-mobile-preview.jpg.

Pause here for the owner's visual review. Remaining screen groups: catalog/inventory; circulation and renewal/damage; enrollment/users; attendance, printing, fines, clearance, notifications and reports.

Final checks: 506 API tests and 310 frontend tests passed under coverage; type checks and production build passed. Frontend statement coverage is 58.35% (no claim of an 80% threshold). The build retains its existing large-bundle warning. `git diff --check` passed. Backend/database/package/lockfile diff is empty. All three comparison website URLs returned HTTP 200. The original comparison clone has no tracked changes.
