-- Record cancellation intent while retaining the active reservation until provider confirmation.
ALTER TABLE online_payment_attempts ADD COLUMN cancel_requested_at timestamptz;
CREATE INDEX online_payment_method_status ON online_payment_attempts(environment,channel_code,state,created_at DESC);

-- Receipt financial data is immutable. Cash reversal may change status; gateway refunds need separate evidence.
CREATE FUNCTION protect_gateway_receipt_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmation_source='Xendit' AND NEW.receipt_status IS DISTINCT FROM OLD.receipt_status THEN
    RAISE EXCEPTION 'A gateway payment requires confirmed provider refund evidence.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_gateway_fine_reversal BEFORE UPDATE ON fine_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION protect_gateway_receipt_reversal();
CREATE TRIGGER protect_gateway_print_reversal BEFORE UPDATE ON print_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION protect_gateway_receipt_reversal();
