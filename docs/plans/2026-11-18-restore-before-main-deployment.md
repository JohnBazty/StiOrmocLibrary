# Restore the production version from before main was deployed

## Why

The owner reported that reverting the fines merge did not restore the expected dashboard. They explicitly selected the Vercel version that was live before main was deployed.

**Date created:** 2026-11-18
**Date last updated:** 2026-11-18
**Status:** built

## How

Promote the existing archived production deployment dpl_6VS6DpgeoHtMXbnRhVkqGpeUacHG (created November 18 at 08:24 Asia/Manila), rather than rebuild the newer GitHub main. That is the exact deployment recorded as current before the main deployment in this session. This restores its complete web/API bundle and dashboard together. Git application code and database records are unchanged by this promotion; production is intentionally using the archived snapshot, independently of the current main application source.

## Implementation tracking

- [x] Confirm the requested baseline with the owner.
- [x] Verify the archived deployment exists and is Ready.
- [x] Promote it to https://sti-ormoc-smart-library.vercel.app.
- [x] Inspect the public alias and confirm its deployment ID matches dpl_6VS6DpgeoHtMXbnRhVkqGpeUacHG.
- [x] Verify home, login, and database/schema health return HTTP 200.

## Verification

The public home loads /assets/index-CCch3xA9.js, replacing the newer rollback bundle. API health reports healthy, schema ready, and no missing tables or columns. No authenticated dashboard interaction was performed; restoration is verified by exact deployment identity and public HTTP checks.

## Change log

- 2026-11-18: Clarified that the owner wanted the prior live Vercel version, not only reversal of the fines merge. Promoted that exact saved deployment and verified alias identity, public pages, and API health. Left concurrent enrollment work untouched.
