# Multi-copy book labels

SmartLib creates multiple accessioned assets under one normalized `titles.title_id`. The administrator enters the title metadata, shelf location, and copy count in the existing **Add book** dialog. `POST /api/v1/admin/books/add-bulk` then performs the whole batch in one transaction.

The current Admin form calls the canonical `POST /api/v1/admin/catalog/bulk-entry` alias. Category and Book Location are live dropdowns populated from Category Management; the server verifies both values again before reserving serials. The original `/api/v1/admin/books/add-bulk` path remains available for backward compatibility.

For each copy, the API reserves a database-backed serial, creates the legacy `materials` circulation bridge, creates one `physical_copies` row, renders a high-density PNG QR code, and renders a Code 128 SVG barcode. A failure in any copy rolls back the entire batch. The QR payload contains only `title_id`, `barcode`, and `accession_number`; it contains no user or credential data.

Barcodes follow `STIORMOC<year><six-digit sequence>`, while accession numbers follow `STI-ACC-<year>-<six-digit sequence>`. The yearly row in `barcode_sequences` is locked with `SELECT ... FOR UPDATE`, and the unique barcode/accession indexes provide the final concurrency safeguard.

After a successful request, the Admin Books and Research page displays a printable sheet. Every row places a square QR label beside a rectangular Code 128 label with its raw identity string. **Print labels** uses an A4 print stylesheet and excludes the rest of the dashboard from the print job.

The physical-copy register also exposes **View Codes**. Its administrative modal renders both images to high-density canvases and provides separate PNG downloads. The Student/Faculty cart drawer uses `/api/v1/catalog/copies/:barcode`, which returns the Code 128 image and book metadata but never queries or returns the QR code. QR inspection and QR PNG downloads remain protected by the Admin/Librarian route guard.
