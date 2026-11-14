-- Additive gateway delivery/recovery state. Keep 034 and applied migration bytes unchanged.
ALTER TABLE online_payment_attempts
  ADD COLUMN checkout_url text,
  ADD COLUMN provider_business_id text,
  ADD COLUMN provider_request_id text,
  ADD COLUMN creation_started_at timestamptz,
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN next_check_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN check_count integer NOT NULL DEFAULT 0 CHECK (check_count>=0),
  ADD COLUMN review_code varchar(64),
  ADD CONSTRAINT sandbox_checkout_origin CHECK (checkout_url IS NULL OR
    checkout_url ~ '^https://(dev\.xen\.to|checkout-staging\.xendit\.co)/[^[:space:]]*$'),
  ADD CONSTRAINT online_attempt_identity UNIQUE(payment_id,environment);

ALTER TABLE online_payment_events
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_error_code varchar(64),
  ADD CONSTRAINT event_attempt_environment FOREIGN KEY(payment_id,environment)
    REFERENCES online_payment_attempts(payment_id,environment);
CREATE INDEX online_payment_recovery_due ON online_payment_attempts(environment,next_check_at)
  WHERE state IN ('Creating','Active','Review');
CREATE INDEX online_payment_event_work ON online_payment_events(environment,next_attempt_at,lease_until)
  WHERE state IN ('Pending','Processing');

-- A gateway receipt must remain tied to its original verified source during reversal or metadata edits.
CREATE FUNCTION preserve_online_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmation_source='Xendit' AND
    (NEW.confirmation_source IS DISTINCT FROM OLD.confirmation_source
      OR NEW.online_payment_attempt_id IS DISTINCT FROM OLD.online_payment_attempt_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.amount_received IS DISTINCT FROM OLD.amount_received
      OR NEW.transaction_fee_centavos IS DISTINCT FROM OLD.transaction_fee_centavos
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method) THEN
    RAISE EXCEPTION 'Preserve the verified payment source and amounts.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_print_gateway_identity BEFORE UPDATE ON print_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION preserve_online_receipt_identity();
CREATE TRIGGER preserve_fine_gateway_identity BEFORE UPDATE ON fine_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION preserve_online_receipt_identity();
