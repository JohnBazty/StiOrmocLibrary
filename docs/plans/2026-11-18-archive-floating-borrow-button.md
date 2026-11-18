# Archive the floating Borrow / Return button

- Why: temporarily remove the floating Borrow / Return entry point at the owner's request.
- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built

## How

Set the floating circulation shortcut visibility flag to false in AttendanceFab. Preserve the button and modal implementation for future restoration. Attendance QR controls and the main circulation screens stay available. Release only this file change over the current canonical Vercel source. No database change.

## Implementation tracking

- [x] Archive only the floating Borrow / Return button.
- [x] Preserve shortcut implementation and other circulation access.
- [x] Skip tests as explicitly requested by the owner.
- [x] Deploy to Vercel production: `dpl_6VS6DpgeoHtMXbnRhVkqGpeUacHG`, promoted successfully to the canonical site.

## Change log

- 2026-11-18: Owner requested temporary button archival and immediate hosting without tests. Implemented a disabled visibility flag in the active main-sync checkout and an isolated production-source release.
- 2026-11-18: Initial Vercel connection failed; retry built successfully and was promoted to `https://sti-ormoc-smart-library.vercel.app`. No automated or browser tests run. Deployment build completed; owner will check the interface.
