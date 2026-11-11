CREATE TABLE online_payment_fee_rules (
  fee_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  channel_code varchar(50) NOT NULL CHECK (channel_code ~ '^[A-Z0-9_]{2,50}$'),
  display_name varchar(80) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency='PHP'),
  fixed_centavos bigint NOT NULL CHECK (fixed_centavos BETWEEN 0 AND 9999999999),
  percentage_basis_points integer NOT NULL CHECK (percentage_basis_points BETWEEN 0 AND 10000),
  tax_basis_points integer NOT NULL CHECK (tax_basis_points BETWEEN 0 AND 10000),
  min_total_centavos bigint NOT NULL CHECK (min_total_centavos > 0),
  max_total_centavos bigint NOT NULL CHECK (max_total_centavos BETWEEN min_total_centavos AND 9999999999),
  is_sample boolean NOT NULL DEFAULT true,
  created_by_account_id bigint NOT NULL REFERENCES accounts(account_id),
  request_key varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (environment='test' OR is_sample=false),
  UNIQUE (created_by_account_id,request_key),
  UNIQUE (fee_rule_id,environment,channel_code)
);
CREATE INDEX online_fee_method_history ON online_payment_fee_rules(environment,channel_code,fee_rule_id DESC);

CREATE FUNCTION preserve_online_fee_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Create a new fee rule version to preserve payment history.' USING ERRCODE='55000';
END $$;
CREATE TRIGGER online_fee_history_immutable BEFORE UPDATE OR DELETE ON online_payment_fee_rules
  FOR EACH ROW EXECUTE FUNCTION preserve_online_fee_history();

CREATE TABLE online_payment_attempts (
  payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id bigint NOT NULL REFERENCES accounts(account_id),
  user_id bigint NOT NULL REFERENCES users(user_id),
  environment text NOT NULL CHECK (environment IN ('test','live')),
  print_request_id bigint REFERENCES print_requests(request_id),
  fine_id bigint REFERENCES fines(fine_id),
  lost_book_report_id bigint REFERENCES lost_book_reports(lost_book_report_id),
  fee_rule_id bigint NOT NULL,
  channel_code varchar(50) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency='PHP'),
  principal_centavos bigint NOT NULL CHECK (principal_centavos BETWEEN 1 AND 9999999999),
  fee_centavos bigint NOT NULL CHECK (fee_centavos BETWEEN 0 AND 9999999999),
  total_centavos bigint NOT NULL CHECK (total_centavos=principal_centavos+fee_centavos AND total_centavos<=9999999999),
  balance_before_centavos bigint NOT NULL CHECK (balance_before_centavos>=principal_centavos),
  state text NOT NULL DEFAULT 'Quoted' CHECK (state IN ('Quoted','Prepared','Creating','Active','Succeeded','Expired','Cancelled','Review')),
  request_key varchar(64),
  provider_session_id text UNIQUE,
  provider_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(print_request_id,fine_id,lost_book_report_id)=1),
  CHECK (expires_at>created_at),
  CHECK (state='Quoted' OR request_key IS NOT NULL),
  CHECK (state<>'Succeeded' OR (provider_session_id IS NOT NULL AND provider_payment_id IS NOT NULL)),
  FOREIGN KEY (fee_rule_id,environment,channel_code)
    REFERENCES online_payment_fee_rules(fee_rule_id,environment,channel_code)
);
CREATE UNIQUE INDEX online_payment_retry_key ON online_payment_attempts(account_id,environment,request_key)
  WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX online_payment_active_print ON online_payment_attempts(environment,print_request_id)
  WHERE state IN ('Prepared','Creating','Active','Review');
CREATE UNIQUE INDEX online_payment_active_fine ON online_payment_attempts(environment,fine_id)
  WHERE state IN ('Prepared','Creating','Active','Review');
CREATE UNIQUE INDEX online_payment_active_loss ON online_payment_attempts(environment,lost_book_report_id)
  WHERE state IN ('Prepared','Creating','Active','Review');
CREATE INDEX online_payment_owner_history ON online_payment_attempts(account_id,created_at DESC);

CREATE TABLE online_payment_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  provider_event_id text NOT NULL,
  payment_id uuid REFERENCES online_payment_attempts(payment_id),
  event_type varchar(100) NOT NULL,
  verified_fields jsonb NOT NULL,
  state text NOT NULL DEFAULT 'Pending' CHECK (state IN ('Pending','Processing','Processed','Review')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (environment,provider_event_id)
);

ALTER TABLE print_payment_receipts
  ALTER COLUMN print_cash_payment_id DROP NOT NULL,
  ADD COLUMN online_payment_attempt_id uuid UNIQUE REFERENCES online_payment_attempts(payment_id),
  ADD COLUMN confirmation_source text NOT NULL DEFAULT 'Legacy',
  ADD COLUMN transaction_fee_centavos bigint NOT NULL DEFAULT 0 CHECK (transaction_fee_centavos>=0),
  ADD COLUMN total_received numeric(12,2) GENERATED ALWAYS AS
    (amount_received + transaction_fee_centavos::numeric/100) STORED;
ALTER TABLE print_payment_receipts ALTER COLUMN confirmation_source SET DEFAULT 'Staff';
ALTER TABLE print_payment_receipts ADD CONSTRAINT print_payment_source CHECK (
  (confirmation_source='Legacy' AND print_cash_payment_id IS NOT NULL AND online_payment_attempt_id IS NULL AND transaction_fee_centavos=0)
  OR (confirmation_source='Staff' AND print_cash_payment_id IS NOT NULL AND online_payment_attempt_id IS NULL
      AND received_by_user_id IS NOT NULL AND payment_method='Cash' AND transaction_fee_centavos=0)
  OR (confirmation_source='Xendit' AND print_cash_payment_id IS NULL AND online_payment_attempt_id IS NOT NULL
      AND received_by_user_id IS NULL AND payment_method<>'Cash')
);

ALTER TABLE fine_payment_receipts
  ALTER COLUMN received_by_user_id DROP NOT NULL,
  ADD COLUMN online_payment_attempt_id uuid UNIQUE REFERENCES online_payment_attempts(payment_id),
  ADD COLUMN confirmation_source text NOT NULL DEFAULT 'Legacy',
  ADD COLUMN transaction_fee_centavos bigint NOT NULL DEFAULT 0 CHECK (transaction_fee_centavos>=0),
  ADD COLUMN total_received numeric(12,2) GENERATED ALWAYS AS
    (amount_received + transaction_fee_centavos::numeric/100) STORED;
ALTER TABLE fine_payment_receipts ALTER COLUMN confirmation_source SET DEFAULT 'Staff';
ALTER TABLE fine_payment_receipts ADD CONSTRAINT fine_payment_source CHECK (
  (confirmation_source='Legacy' AND online_payment_attempt_id IS NULL AND transaction_fee_centavos=0)
  OR (confirmation_source='Staff' AND online_payment_attempt_id IS NULL AND received_by_user_id IS NOT NULL
      AND payment_method='Cash' AND transaction_fee_centavos=0)
  OR (confirmation_source='Xendit' AND online_payment_attempt_id IS NOT NULL
      AND received_by_user_id IS NULL AND payment_method<>'Cash')
);

CREATE FUNCTION check_online_receipt_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment online_payment_attempts%ROWTYPE;
BEGIN
  IF NEW.confirmation_source<>'Xendit' THEN RETURN NEW; END IF;
  SELECT * INTO payment FROM online_payment_attempts WHERE payment_id=NEW.online_payment_attempt_id;
  IF NOT FOUND OR payment.state<>'Succeeded' OR payment.user_id<>NEW.user_id
    OR payment.principal_centavos<>NEW.amount_received*100
    OR payment.fee_centavos<>NEW.transaction_fee_centavos OR payment.channel_code<>NEW.payment_method THEN
    RAISE EXCEPTION 'The gateway receipt must match a confirmed payment.' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='print_payment_receipts' THEN
    IF payment.print_request_id IS DISTINCT FROM NEW.request_id THEN
      RAISE EXCEPTION 'The gateway payment belongs to another bill.' USING ERRCODE='23514';
    END IF;
  ELSIF payment.print_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'A printing payment cannot settle a fine.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_print_gateway_receipt BEFORE INSERT OR UPDATE ON print_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION check_online_receipt_source();
CREATE TRIGGER validate_fine_gateway_receipt BEFORE INSERT OR UPDATE ON fine_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION check_online_receipt_source();

CREATE FUNCTION check_online_fine_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment online_payment_attempts%ROWTYPE;
BEGIN
  SELECT a.* INTO payment FROM online_payment_attempts a JOIN fine_payment_receipts r
    ON r.online_payment_attempt_id=a.payment_id WHERE r.fine_payment_receipt_id=NEW.fine_payment_receipt_id;
  IF FOUND AND (payment.fine_id IS DISTINCT FROM NEW.fine_id
    OR payment.lost_book_report_id IS DISTINCT FROM NEW.lost_book_report_id
    OR payment.principal_centavos<>NEW.amount_allocated*100) THEN
    RAISE EXCEPTION 'Apply only the confirmed principal to its own obligation.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_online_fine_allocation BEFORE INSERT OR UPDATE ON fine_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION check_online_fine_allocation();

ALTER TABLE online_payment_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON online_payment_fee_rules,online_payment_attempts,online_payment_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE online_payment_fee_rules_fee_rule_id_seq,online_payment_events_event_id_seq FROM PUBLIC,anon,authenticated;
