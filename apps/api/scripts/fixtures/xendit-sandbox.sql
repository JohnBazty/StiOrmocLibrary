CREATE SCHEMA IF NOT EXISTS xendit_sandbox;
REVOKE ALL ON SCHEMA xendit_sandbox FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TABLE IF NOT EXISTS xendit_sandbox.setup (
  id smallint PRIMARY KEY CHECK (id = 1),
  environment text NOT NULL CHECK (environment = 'test'),
  fixture_version integer NOT NULL CHECK (fixture_version = 1)
);
INSERT INTO xendit_sandbox.setup VALUES (1, 'test', 1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS xendit_sandbox.fixture_users (
  id integer PRIMARY KEY,
  name text NOT NULL,
  purpose text NOT NULL CHECK (purpose = 'disposable-payment-test')
);
INSERT INTO xendit_sandbox.fixture_users VALUES
  (1, 'Sandbox Test Student', 'disposable-payment-test'),
  (2, 'Sandbox Other Student', 'disposable-payment-test')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS xendit_sandbox.fixture_charges (
  id integer PRIMARY KEY,
  user_id integer NOT NULL REFERENCES xendit_sandbox.fixture_users(id),
  kind text NOT NULL CHECK (kind IN ('Printing', 'Fine')),
  principal numeric(12,2) NOT NULL CHECK (principal > 0),
  paid_principal numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_principal >= 0),
  eligible boolean NOT NULL,
  scenario text NOT NULL,
  CHECK (paid_principal <= principal)
);
INSERT INTO xendit_sandbox.fixture_charges VALUES
  (1, 1, 'Printing', 50, 0, true, 'Unpaid full printing bill'),
  (2, 1, 'Fine', 100, 0, true, 'Unpaid finalized fine'),
  (3, 1, 'Fine', 100, 40, true, 'Partial payment leaves PHP 60 principal'),
  (4, 1, 'Fine', 100, 0, false, 'Return overdue book before payment'),
  (5, 2, 'Printing', 50, 0, true, 'Another owner must be inaccessible')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS xendit_sandbox.sample_fees (
  id smallint PRIMARY KEY CHECK (id = 1),
  environment text NOT NULL CHECK (environment = 'test'),
  fixed_centavos integer NOT NULL CHECK (fixed_centavos = 100),
  percentage_basis_points integer NOT NULL CHECK (percentage_basis_points = 100),
  calculation_basis text NOT NULL CHECK (calculation_basis = 'principal'),
  live_approved boolean NOT NULL CHECK (live_approved = false)
);
INSERT INTO xendit_sandbox.sample_fees VALUES (1, 'test', 100, 100, 'principal', false)
ON CONFLICT DO NOTHING;

GRANT USAGE ON SCHEMA xendit_sandbox TO sandbox_app;
GRANT SELECT ON ALL TABLES IN SCHEMA xendit_sandbox TO sandbox_app;
