# Attendance saved QR image reading

## Why

A downloaded attendance pass could not be read by the saved-image scanner. The interface displayed the decoder's raw `No MultiFormat Readers were able to detect the code.` error.

## Date created

2026-11-14

## Date last updated

2026-11-14

## Status

built

## How

The reported PNG reproduces the error with the installed ZXing decoder at its original orientation. The same image decodes at 180 and 270 degrees. The credential and image are valid; this is a decoder orientation limitation rather than an account lookup failure.

The attendance scanner first reads the original image using the existing `html5-qrcode` reader. If decoding fails, a local helper retries PNG copies at 90, 180 and 270 degrees. Canvas quarter turns preserve the QR pixels. The original selected file stays available for preview and retry. The helper releases its image bitmap and returns a plain-language instruction if no orientation succeeds.

The decoded value still goes through the existing server verification and visitor review. Purpose selection and explicit confirmation still precede attendance recording. Camera scanning, generated passes, API authorization, credential validation and database behavior are unchanged. No migration, dependency or private pass fixture is added.

## Implementation tracking

- [x] Reproduce with the reported file without logging its credential.
- [x] Confirm the same decoder reads the image when rotated.
- [x] Add tests that fail with the original direct-scan behavior.
- [x] Add local orientation retries and a readable failure message.
- [x] Verify the original PNG in the real scanner component in an isolated Edge browser with a mocked visitor-resolution response; review appears, confirmation requires a purpose, and cancelling records nothing.
- [x] Complete repository tests, type checks and production build.

## Verification and limitations

Focused helper and scanner tests pass. Full repository verification passed: 508 API tests, 333 frontend tests, root type checks and production build. Tests used the documented process-only `WEB_ORIGIN=http://localhost:5173` override. The existing large-bundle warning remains. Coverage was not rerun for this bug fix.

The browser check used the real image decoder and original selected file; API responses were intercepted to avoid database writes. No live attendance entry or exit was recorded. Camera hardware was not tested.

## Change log

- 2026-11-14: Isolated the orientation-specific decoder failure and added saved-image retries. Existing uncommitted integration work and both comparison folders are preserved.
- 2026-11-14: Completed real-browser verification, full tests, type checks and production build. No push, merge or deployment.
