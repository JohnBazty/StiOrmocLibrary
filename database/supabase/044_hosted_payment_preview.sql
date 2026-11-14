-- Persistent Xendit practice history only. No school obligation/receipt is changed.
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.hosted_payment_preview (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attempts)='array'),
  funds jsonb NOT NULL DEFAULT '{"version":1,"operations":[],"beneficiaries":[],"voids":[]}'::jsonb CHECK (jsonb_typeof(funds)='object'),
  lease_owner uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lease_owner IS NULL)=(lease_until IS NULL))
);
ALTER TABLE public.hosted_payment_preview ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hosted_payment_preview FROM PUBLIC, anon, authenticated;
INSERT INTO public.hosted_payment_preview(singleton) VALUES(true);
