# Sidebar account display

| Field | Value |
| --- | --- |
| Date created | 2026-10-11 |
| Date last updated | 2026-10-11 |
| Status | `built` |

## Why

The owner requested the sidebar account card display their profile picture, name and school ID, instead of only a role abbreviation and ID.

## How

The shared sidebar reads the authenticated user's existing `/profile/me` and `/profile/avatar/me` endpoints independently. Display the full name, school ID, role and approved profile photo. Use name initials when there is no approved photo or an image fails. Pending replacement photos remain excluded from the account card.

Refresh on navigation, successful owner profile edits, window focus/visibility and a minute timer while visible. This also renews the avatar URL, which expires after five minutes. Event refreshes received during an in-flight request are queued. Requests remain scoped to the current authenticated account; no additional access or schema changes.

## Implementation tracking

- [x] Connect sidebar identity to the live profile and approved avatar endpoints.
- [x] Preserve name/ID if avatar storage fails; add initials fallback.
- [x] Refresh saved names and expiring/approved photo URLs.
- [x] Verify focused tests, build and visual account-card layout.

## Verification

- Web production build passed. Eight focused tests passed across the sidebar card and profile page, covering approved-versus-pending photos, broken images, avatar-service failure, live profile edits and preserved upload behavior.
- Read-only database lookup confirmed `02000351061` has the name John Bazty Cantay and one approved photo, with no pending replacement. No database data changed.
- Browser layout check used the actual component in a temporary 256-pixel sidebar preview with a placeholder image. Name, ID, role and image fit the card. Screenshot saved to `C:/Users/JOHN/AppData/Local/Temp/sidebar-account-card.png`; preview HTML/tab removed. Real signed-in cards load the approved photo from the existing authenticated API.

## Change log

- 2026-10-11: Owner authorized display of their PFP, name and ID. Local implementation in progress. No database change, push or deployment; Postgres next 025 / MySQL reference next 048 unchanged.
- 2026-10-11: Completed and verified the shared sidebar account card and profile-update refresh event. Local server continues running with frontend hot reload.
