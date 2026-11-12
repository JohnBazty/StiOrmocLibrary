-- Shared rate-limit counters for the auth endpoints.
-- express-rate-limit kept hits in each API instance's memory, so every Vercel instance had its own budget.
-- One row per limiter and client (bucket_key = '<limiter>:<client key>'). Safe to run more than once.
-- No policies on purpose: only the table owner or a BYPASSRLS role (the API's server connection) may read or write.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket_key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_hits FROM PUBLIC, anon, authenticated;
