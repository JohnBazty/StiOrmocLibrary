-- Existing requests retain their original reservation workflow and history.
-- New cart handovers share the hold ledger but never enter the reservation queue.
ALTER TABLE reservations ADD COLUMN request_kind VARCHAR(20) NOT NULL DEFAULT 'Reservation'
  CHECK (request_kind IN ('Reservation','CartHandover'));
CREATE INDEX ix_reservation_kind_status ON reservations(request_kind,reservation_status,book_title_id);
ALTER TABLE reservations ADD CONSTRAINT ck_cart_handover_assignment CHECK (
  request_kind <> 'CartHandover' OR (
    assigned_physical_copy_id IS NOT NULL AND accession_id IS NOT NULL
    AND reservation_status IN ('approved','claimed','cancelled')
    AND pickup_deadline IS NULL AND ready_at IS NULL
  )
);
COMMENT ON COLUMN reservations.request_kind IS 'Reservation: unavailable-title waiting list, including preserved legacy requests. CartHandover: available copy held for staff handover, no loan until confirmed.';
