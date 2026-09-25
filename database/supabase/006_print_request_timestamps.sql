-- ============================================================================
-- Print request workflow timestamps missing from early Supabase drafts.
-- Additive only; safe after 001–005.
-- ============================================================================

ALTER TABLE print_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP DEFAULT NULL;
ALTER TABLE print_requests ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT NULL;
ALTER TABLE print_requests ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP DEFAULT NULL;
ALTER TABLE print_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP DEFAULT NULL;
ALTER TABLE print_requests ADD COLUMN IF NOT EXISTS cancelled_reason VARCHAR(255) DEFAULT NULL;
