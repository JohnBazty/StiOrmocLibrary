-- Campus times are Asia/Manila. The API asks for it with the `-c timezone=Asia/Manila`
-- startup option, but Vercel reaches Supabase through the transaction pooler (port 6543),
-- which does not forward startup options. Those sessions ran in UTC, so every time the
-- database filled in itself (NOW(), CURRENT_TIMESTAMP defaults on TIMESTAMP columns) was
-- written as UTC clock time and read back as Manila time: 8 hours early
-- (a 10:26 AM borrow notice showed 2:26 AM).
--
-- A role-level default applies to every new server session the pooler opens for this role,
-- whatever the client sends. It only touches the role running this migration (the library
-- app's own role), never the database default or the sti_ilms_rea role.
-- Rows already written by UTC sessions are not rewritten: local (session-mode) writes in
-- the same tables were correct, so the two cannot be told apart safely.
ALTER ROLE CURRENT_USER SET timezone = 'Asia/Manila';
SET timezone = 'Asia/Manila';
