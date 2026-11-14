-- Library-entered provider settlement evidence. Payment success alone is not bank settlement.
-- A captured exception must coexist with another still-active checkout for the same obligation.
-- The service and counter guards block new collection while any Review record remains unresolved.
DROP INDEX online_payment_active_print;
DROP INDEX online_payment_active_fine;
DROP INDEX online_payment_active_loss;
CREATE UNIQUE INDEX online_payment_active_print ON online_payment_attempts(environment,print_request_id)
  WHERE state IN ('Prepared','Creating','Active','Review') AND provider_payment_id IS NULL;
CREATE UNIQUE INDEX online_payment_active_fine ON online_payment_attempts(environment,fine_id)
  WHERE state IN ('Prepared','Creating','Active','Review') AND provider_payment_id IS NULL;
CREATE UNIQUE INDEX online_payment_active_loss ON online_payment_attempts(environment,lost_book_report_id)
  WHERE state IN ('Prepared','Creating','Active','Review') AND provider_payment_id IS NULL;
ALTER TABLE online_payment_attempts ADD CONSTRAINT captured_payment_state
  CHECK(provider_payment_id IS NULL OR state IN ('Succeeded','Review'));

CREATE TABLE online_payment_settlements (
  payment_id uuid PRIMARY KEY REFERENCES online_payment_attempts(payment_id),
  provider_reference varchar(120) NOT NULL CHECK (length(trim(provider_reference)) BETWEEN 3 AND 120),
  gross_centavos bigint NOT NULL CHECK (gross_centavos>0),
  processing_cost_centavos bigint NOT NULL CHECK (processing_cost_centavos BETWEEN 0 AND gross_centavos),
  net_centavos bigint GENERATED ALWAYS AS (gross_centavos-processing_cost_centavos) STORED,
  settled_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_account_id bigint NOT NULL REFERENCES accounts(account_id)
);
CREATE FUNCTION validate_payment_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM online_payment_attempts WHERE payment_id=NEW.payment_id
    AND state='Succeeded' AND total_centavos=NEW.gross_centavos) THEN
    RAISE EXCEPTION 'Settlement must match a verified successful payment.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_payment_settlement BEFORE INSERT ON online_payment_settlements
  FOR EACH ROW EXECUTE FUNCTION validate_payment_settlement();
CREATE FUNCTION preserve_payment_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Preserve original settlement evidence.' USING ERRCODE='55000';
END $$;
CREATE TRIGGER preserve_payment_settlement BEFORE UPDATE OR DELETE ON online_payment_settlements
  FOR EACH ROW EXECUTE FUNCTION preserve_payment_settlement();
ALTER TABLE online_payment_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON online_payment_settlements FROM PUBLIC,anon,authenticated;
CREATE INDEX payment_settlement_date ON online_payment_settlements(settled_at,payment_id);
