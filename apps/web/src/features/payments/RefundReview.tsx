import { ArrowDownToLine, Ban, Building2, Undo2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { moneyOutApi, moneyOutStatus, type Destination, type MoneyOutRecord } from './money-out-api'
import { paymentMoney, type Payment } from './payments-api'
import './payments.css'

function dialogIconForTitle(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('bank') || lower.includes('destination')) return <Building2 size={20} aria-hidden="true" />
  if (lower.includes('withdrawal') || lower.includes('withdraw')) return <ArrowDownToLine size={20} aria-hidden="true" />
  if (lower.includes('void')) return <Ban size={20} aria-hidden="true" />
  return <Undo2 size={20} aria-hidden="true" />
}

export function MoneyOutDialog({
  title,
  children,
  busy,
  onClose,
}: {
  title: string
  children: ReactNode
  busy: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const element = ref.current
    if (element?.showModal) element.showModal()
    else element?.setAttribute('open', '')
    return () => element?.close?.()
  }, [])
  return (
    <dialog
      ref={ref}
      className="payment-ui payment-dialog"
      aria-labelledby={id}
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="payment-dialog-shell">
        <header className="payment-dialog-header">
          <span className="payment-service-icon">{dialogIconForTitle(title)}</span>
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            className="payment-close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="payment-dialog-content">{children}</div>
      </div>
    </dialog>
  )
}

export function RefundTimeline({ rows }: { rows?: MoneyOutRecord[] }) {
  if (!rows?.length) return null
  return (
    <section className="refund-timeline" aria-label="Refund history">
      <h3>Refund history</h3>
      {rows.map(row => (
        <article key={row.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{moneyOutStatus(row.state)}</strong>
            <strong>{paymentMoney(row.totalCentavos)}</strong>
          </div>
          <p className="payment-muted text-sm">
            {row.reference} · {new Date(row.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
          </p>
          <p className="mt-2 text-sm">
            {paymentMoney(row.principalCentavos)} payment + {paymentMoney(row.feeCentavos)} transaction fee
          </p>
          <p className="mt-1 text-sm">
            {row.decision === 'Restore'
              ? 'The refunded part of the bill becomes unpaid after confirmation.'
              : 'The refunded part of the charge is cancelled after confirmation.'}
          </p>
          {['Processing', 'Review'].includes(row.state) ? (
            <p className="payment-muted mt-2 text-sm">
              The original payment stays applied until the refund is confirmed.
            </p>
          ) : null}
        </article>
      ))}
    </section>
  )
}

export function MoneyOutSummary({ row }: { row: MoneyOutRecord }) {
  return (
    <div className="payment-summary">
      <dl>
        <div>
          <dt>{row.type === 'Refund' ? 'Payment amount returned' : 'School bank receives'}</dt>
          <dd>{paymentMoney(row.principalCentavos)}</dd>
        </div>
        <div>
          <dt>{row.type === 'Refund' ? 'Transaction fee returned' : 'Provider transfer fee'}</dt>
          <dd>{paymentMoney(row.feeCentavos)}</dd>
        </div>
        <div className="payment-summary-total">
          <dt>{row.type === 'Refund' ? 'Total refund' : 'Total balance deduction'}</dt>
          <dd>{paymentMoney(row.totalCentavos + (row.type === 'Withdrawal' ? row.feeCentavos : 0))}</dd>
        </div>
      </dl>
      {row.destination ? (
        <p className="mt-4 text-sm">
          {row.destination.name}
          <br />
          {row.destination.bank} · {row.destination.account}
        </p>
      ) : (
        <p className="mt-4 text-sm">Returns to the original payment method.</p>
      )}
      {row.decision ? (
        <p className="mt-4 text-sm">
          {row.decision === 'Restore'
            ? 'Restore the refunded part of the unpaid balance.'
            : 'Cancel the refunded part of the charge.'}
        </p>
      ) : null}
    </div>
  )
}

export function DestinationForm({
  paymentId,
  onSaved,
  onCancel,
}: {
  paymentId?: string
  onSaved: (destination: Destination) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    name: '',
    accountNumber: '',
    bankCode: '',
    firstName: '',
    lastName: '',
    street: '',
    city: '',
    province: '',
    postalCode: '',
    evidence: '',
  })
  const [confirmed, setConfirmed] = useState(false)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const destination = await moneyOutApi.beneficiary({
        ...values,
        type: paymentId ? 'StudentRefund' : 'SchoolBank',
        ...(paymentId ? { paymentId } : {}),
        confirmed,
      })
      onSaved(destination)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The destination could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const fields = [
    ['name', 'Account holder name'],
    ['accountNumber', paymentId ? 'GCash mobile number' : 'School bank account number'],
    ...(paymentId
      ? [
          ['firstName', 'Student first name'],
          ['lastName', 'Student last name'],
        ]
      : [['bankCode', 'Bank SWIFT code']]),
    ['street', 'Street address'],
    ['city', 'City'],
    ['province', 'Province'],
    ['postalCode', 'Postal code'],
    ['evidence', paymentId ? 'How did you verify this student’s account?' : 'School authorization reference'],
  ] as Array<[keyof typeof values, string]>

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">
        {paymentId ? 'Verify student refund destination' : 'Add approved school bank'}
      </h3>
      <p className="payment-muted text-sm">
        {paymentId
          ? 'Use the student’s verified GCash account. This destination is only for refunds of their QRPh payments.'
          : 'Use a bank account owned and approved by the school. Personal accounts and wallets cannot receive library withdrawals.'}
      </p>
      {review ? (
        <div className="payment-summary">
          <p className="font-bold">{values.name}</p>
          <p>
            {paymentId ? 'GCash' : values.bankCode} · •••• {values.accountNumber.slice(-4)}
          </p>
          <p className="mt-3 text-sm">
            {values.street}, {values.city}, {values.province} {values.postalCode}
          </p>
          <p className="mt-3 text-sm">Verification: {values.evidence}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <label key={key} className="text-sm font-semibold">
              {label}
              <input
                required
                className="payment-field mt-2"
                value={values[key]}
                maxLength={key === 'evidence' ? 500 : 200}
                autoComplete="off"
                onChange={event => setValues(value => ({ ...value, [key]: event.target.value }))}
              />
            </label>
          ))}
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
            />
            {paymentId
              ? 'I verified that this account belongs to the student receiving the refund.'
              : 'I verified school ownership and authorization for this bank account.'}
          </label>
        </div>
      )}
      {error ? (
        <p role="alert" className="payment-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="payment-button"
          disabled={busy}
          onClick={() => (review ? setReview(false) : onCancel())}
        >
          {review ? 'Back' : 'Cancel'}
        </Button>
        <Button
          className="payment-button"
          disabled={busy || !confirmed || fields.some(([key]) => !values[key].trim())}
          onClick={() => (review ? void save() : setReview(true))}
        >
          {busy ? 'Saving…' : review ? 'Save verified destination' : 'Review destination'}
        </Button>
      </div>
    </div>
  )
}

export function VoidFineReview({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment
  onClose: () => void
  onSaved: () => void
}) {
  const [reason, setReason] = useState('')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID())

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      await moneyOutApi.voidFine(payment.paymentId, reason, key.current)
      onSaved()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The charge could not be voided.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MoneyOutDialog title="Void unpaid charge" busy={busy} onClose={onClose}>
      <div className="space-y-5">
        <p>
          Cancel only the unpaid remainder of this fine. Previously received payments stay in history. This action does not return money.
        </p>
        <label className="block font-semibold">
          Reason
          <textarea
            className="payment-field mt-2"
            rows={3}
            value={reason}
            maxLength={500}
            disabled={review}
            onChange={event => setReason(event.target.value)}
          />
        </label>
        {review ? (
          <p className="payment-summary">
            The current unpaid remainder will be checked again before saving. The cancelled amount stops blocking clearance.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="payment-error">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          {review ? (
            <Button variant="secondary" className="payment-button" disabled={busy} onClick={() => setReview(false)}>
              Back
            </Button>
          ) : null}
          <Button
            className="payment-button"
            disabled={busy || reason.trim().length < 10}
            onClick={() => (review ? void save() : setReview(true))}
          >
            {busy ? 'Saving…' : review ? 'Confirm void charge' : 'Review charge'}
          </Button>
        </div>
      </div>
    </MoneyOutDialog>
  )
}
