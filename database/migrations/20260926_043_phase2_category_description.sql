-- MySQL rollback reference for Phase 2 A2. Supabase 008 already added this field.
ALTER TABLE categories ADD COLUMN description VARCHAR(255) NOT NULL DEFAULT '' AFTER category_name;
