-- New quotations may record an amount without an attachment. Existing attachments remain unchanged.
ALTER TABLE book_quotations
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN original_name DROP NOT NULL,
  ALTER COLUMN mime_type DROP NOT NULL;
