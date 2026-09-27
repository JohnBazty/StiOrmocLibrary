import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export type InvoiceSource = 'Printing' | 'Fine Collection'
function id(value: unknown) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(422, 'INVOICE_ID_INVALID', 'Choose a valid payment.'); return number }
function source(value: unknown): InvoiceSource {
  if (value === 'Printing' || value === 'Fine Collection') return value
  throw new HttpError(422, 'INVOICE_SOURCE_INVALID', 'Choose a supported payment type.')
}
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function classification(value: unknown) {
  if (value === 'Invoiceable' || value === 'Acknowledgment Only' || value === 'Unclassified') return value
  throw new HttpError(422, 'INVOICE_CLASSIFICATION_INVALID', 'Choose Invoiceable, Acknowledgment Only, or Unclassified.')
}
async function staffUserId(connection: PoolConnection, accountId: unknown) {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? LIMIT 1', [id(accountId)])
  return rows[0]?.user_id ? Number(rows[0].user_id) : null
}

export function createInvoiceService(database: Pool = db, issuanceEnabled = process.env.INVOICE_ISSUANCE_ENABLED === 'true') {
  return {
  async list(limitValue: unknown = 100) {
    const limit = Math.min(Math.max(Math.trunc(Number(limitValue) || 100), 1), 200)
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT invoice_id,invoice_number,source_type,source_id,revision,customer_name,customer_school_id,amount,status,issued_at,voided_at
      FROM customer_invoices ORDER BY invoice_id DESC LIMIT ${limit}`)
    return rows
  },
  async setup() {
    const [rows] = await database.execute<RowDataPacket[]>('SELECT * FROM invoice_setup WHERE settings_id=1')
    return rows[0] ? { ...rows[0], issuanceEnabled } : null
  },
  async configure(body: unknown) {
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    const issuerName = clean(input.issuerName, 255), issuerAddress = clean(input.issuerAddress, 1000)
    const issuerTin = clean(input.issuerTin, 50), authorityReference = clean(input.authorityReference, 100)
    const serialPrefix = clean(input.serialPrefix, 20)
    const serialStart = Number(input.serialStart), serialEnd = Number(input.serialEnd)
    const approved = input.approved === true
    const printClassification = classification(input.printClassification)
    const fineClassification = classification(input.fineClassification)
    if (approved && (!issuerName || !issuerAddress || !issuerTin || !authorityReference || !serialPrefix || !Number.isSafeInteger(serialStart) || serialStart < 1 || !Number.isSafeInteger(serialEnd) || serialEnd < serialStart)) {
      throw new HttpError(422, 'INVOICE_SETUP_INCOMPLETE', 'Enter the approved issuer details, authority reference, and valid serial range before enabling invoices.')
    }
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM invoice_setup WHERE settings_id=1 FOR UPDATE')
      const old = rows[0]
      if (!old) throw new HttpError(503, 'INVOICE_SETUP_MISSING', 'Apply the invoice migration first.')
      const [issued] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM customer_invoices')
      if (Number(issued[0]?.total ?? 0) > 0 && (String(old.serial_prefix) !== serialPrefix || Number(old.serial_start) !== serialStart || Number(old.serial_end) !== serialEnd || String(old.issuer_tin) !== issuerTin)) {
        throw new HttpError(422, 'INVOICE_SERIES_LOCKED', 'An issued invoice has locked this issuer and serial series. Start a reviewed new series through a separate migration.')
      }
      await connection.execute(`UPDATE invoice_setup SET issuer_name=?,issuer_address=?,issuer_tin=?,authority_reference=?,serial_prefix=?,serial_start=?,serial_end=?,
        next_serial=?,print_classification=?,fine_classification=?,approved=?,updated_at=NOW() WHERE settings_id=1`,
      [issuerName, issuerAddress, issuerTin, authorityReference, serialPrefix, serialStart || 1, serialEnd || 0,
        Number(issued[0]?.total ?? 0) > 0 ? Number(old.next_serial) : serialStart || 1, printClassification, fineClassification, approved ? 1 : 0])
      await connection.commit()
      return { approved, printClassification, fineClassification }
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  },
  async issue(sourceValue: unknown, sourceIdValue: unknown, accountId: unknown) {
    if (!issuanceEnabled) throw new HttpError(422, 'INVOICE_ISSUANCE_DISABLED', 'Invoice issuance is awaiting the school finance team’s approved document format and production authorization.')
    const kind = source(sourceValue), sourceId = id(sourceIdValue)
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const [settings] = await connection.execute<RowDataPacket[]>('SELECT * FROM invoice_setup WHERE settings_id=1 FOR UPDATE')
      const setup = settings[0]
      if (!setup || !setup.approved) throw new HttpError(422, 'INVOICE_NOT_APPROVED', 'Approved issuer and permit details must be configured before invoices can be issued.')
      const chosen = kind === 'Printing' ? setup.print_classification : setup.fine_classification
      if (chosen !== 'Invoiceable') throw new HttpError(422, 'INVOICE_NOT_CLASSIFIED', 'The finance team has not classified this payment as invoiceable.')
      const [existing] = await connection.execute<RowDataPacket[]>('SELECT * FROM customer_invoices WHERE source_type=? AND source_id=? ORDER BY revision DESC LIMIT 1', [kind, sourceId])
      if (existing[0]?.status === 'Issued') { await connection.commit(); return existing[0] }
      if (Number(setup.next_serial) > Number(setup.serial_end)) throw new HttpError(422, 'INVOICE_SERIES_EXHAUSTED', 'The approved invoice serial range is exhausted.')
      const query = kind === 'Printing'
        ? `SELECT r.receipt_status AS status,r.student_name_snapshot AS customer_name,r.school_id_snapshot AS school_id,
                 r.file_name_snapshot AS description,r.amount_received AS amount
            FROM print_payment_receipts r WHERE r.print_receipt_id=? LIMIT 1 FOR UPDATE`
        : `SELECT r.receipt_status AS status,u.full_name AS customer_name,u.school_id,
                 'Library collection' AS description,r.amount_received AS amount
            FROM fine_payment_receipts r JOIN users u ON u.user_id=r.user_id WHERE r.fine_payment_receipt_id=? LIMIT 1 FOR UPDATE`
      const [payments] = await connection.execute<RowDataPacket[]>(query, [sourceId])
      const payment = payments[0]
      if (!payment || payment.status !== 'Issued') throw new HttpError(422, 'INVOICE_PAYMENT_INVALID', 'Only an issued, unreversed payment record can support an invoice.')
      const serial = Number(setup.next_serial)
      const invoiceNumber = `${setup.serial_prefix}${serial}`
      const actor = await staffUserId(connection, accountId)
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO customer_invoices(source_type,source_id,revision,invoice_number,issuer_name,issuer_address,issuer_tin,authority_reference,
          customer_name,customer_school_id,description,amount,issued_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [kind, sourceId, Number(existing[0]?.revision ?? 0) + 1, invoiceNumber,
          setup.issuer_name, setup.issuer_address, setup.issuer_tin, setup.authority_reference,
          payment.customer_name, payment.school_id, payment.description, payment.amount, actor])
      await connection.execute('UPDATE invoice_setup SET next_serial=next_serial+1,updated_at=NOW() WHERE settings_id=1')
      await connection.commit()
      return { invoice_id: Number(result.insertId), invoice_number: invoiceNumber, status: 'Issued' }
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  },
  async get(invoiceIdValue: unknown, accountId: unknown, admin: boolean) {
    const invoiceId = id(invoiceIdValue)
    const sql = `SELECT i.* FROM customer_invoices i ${admin ? '' : 'JOIN accounts a ON a.school_id=i.customer_school_id'} WHERE i.invoice_id=? ${admin ? '' : 'AND a.account_id=?'} LIMIT 1`
    const [rows] = await database.execute<RowDataPacket[]>(sql, admin ? [invoiceId] : [invoiceId, id(accountId)])
    if (!rows[0]) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'The invoice was not found.')
    return rows[0]
  },
  async mine(accountId: unknown) {
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT i.invoice_id,i.invoice_number,i.source_type,i.source_id,i.amount,i.status,i.issued_at
      FROM customer_invoices i JOIN accounts a ON a.school_id=i.customer_school_id WHERE a.account_id=? ORDER BY i.invoice_id DESC`, [id(accountId)])
    return rows
  },
  async void(invoiceIdValue: unknown, reasonValue: unknown, accountId: unknown) {
    const invoiceId = id(invoiceIdValue), reason = clean(reasonValue, 500)
    if (reason.length < 10) throw new HttpError(422, 'INVOICE_VOID_REASON_REQUIRED', 'Enter a reason of at least 10 characters.')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const actor = await staffUserId(connection, accountId)
      const [result] = await connection.execute<ResultSetHeader>(`UPDATE customer_invoices SET status='Voided',voided_by_user_id=?,voided_at=NOW(),void_reason=?
        WHERE invoice_id=? AND status='Issued'`, [actor, reason, invoiceId])
      if (!result.affectedRows) throw new HttpError(422, 'INVOICE_ALREADY_VOIDED', 'Only an issued invoice can be voided.')
      await connection.commit()
      return { invoiceId, status: 'Voided' }
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  },
}

}

export const invoiceService = createInvoiceService()
