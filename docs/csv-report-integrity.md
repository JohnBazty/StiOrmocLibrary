# CSV Report Integrity

CSV is a plain-text interchange format and cannot be made read-only. Spreadsheet applications will always permit a downloaded CSV to be edited. SmartLib therefore makes administrative CSV reports **tamper-evident** instead of claiming that they are locked.

## Protection applied during download

- Existing formula-injection neutralization remains enabled for cells beginning with `=`, `+`, `-`, or `@`.
- The API streams report rows and computes an HMAC-SHA256 seal at the same time, so long reports are not buffered in memory.
- A `__SMARTLIB_REPORT_SIGNATURE__` footer authenticates the header, every row, row order, and the complete report contents.
- Editing, adding, deleting, or reordering content invalidates the seal.
- The signing key is server-only and comes from `REPORT_INTEGRITY_SECRET`; it is never included in the download.
- Responses include `X-SmartLib-CSV-Integrity: HMAC-SHA256; version=v1` and `Cache-Control: private, no-store`.

The footer detects manipulation; it does not prevent a person from editing their local copy. Use the PDF export when a visually read-only report is preferred.

## Verify a downloaded report

From the repository root, run:

```powershell
npm run reports:verify-csv -w @sti-library/api -- "C:\path\to\smartlib-physical-inventory.csv"
```

An unchanged report prints `VALID`. An edited, truncated, or unsigned file prints `INVALID` and exits with a non-zero status.

Verification must use the same `REPORT_INTEGRITY_SECRET` that signed the report. Rotating that secret prevents old reports from being verified unless the old key is retained securely.
