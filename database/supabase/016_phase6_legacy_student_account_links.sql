-- Phase 6 repair: give existing Student/Faculty users their missing login account.
-- Preserve each operational user ID, password hash, role, and lifecycle state.
-- Rows already linked to an account remain unchanged. A school-ID conflict is
-- left untouched for manual review instead of taking over another identity.
INSERT INTO accounts (user_id, school_id, password_hash, role, account_status)
SELECT u.user_id, u.school_id, u.password_hash, u.user_role, u.account_status
FROM users AS u
LEFT JOIN accounts AS linked ON linked.user_id = u.user_id
LEFT JOIN accounts AS claimed_id ON claimed_id.school_id = u.school_id
WHERE u.user_role IN ('Student', 'Faculty')
  AND linked.account_id IS NULL
  AND claimed_id.account_id IS NULL
  AND u.account_status IN ('Active', 'Deactivated', 'Archived')
ON CONFLICT DO NOTHING;
