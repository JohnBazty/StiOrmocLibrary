import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, ShieldCheck, Smartphone, Wallet } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { paymentMoney, type Payment } from './payments-api'

type Step = 'number' | 'pin' | 'review'

const sanitizePhInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 12) return ('0' + digits.slice(2)).slice(0, 11)
  if (digits.startsWith('639')) return ('0' + digits.slice(2)).slice(0, 11)
  return digits.slice(0, 11)
}

const mobileNumber = (value: string) => {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('63')) return ('0' + digits.slice(2)).slice(0, 11)
  if (digits.startsWith('9') && digits.length === 10) return '0' + digits
  return digits.slice(0, 11)
}

const isValidPhMobile = (value: string) => /^09\d{9}$/.test(mobileNumber(value))

/** Assigned library wallet fixtures only; actual GCash credentials belong on the provider's page. */
export function DemoWalletCheckout({
  payment,
  accounts,
  busy,
  error,
  onPay,
  onBack,
  onClose,
}: {
  payment: Payment
  accounts: Array<{ number: string; pin: string }>
  busy: boolean
  error: string
  onPay: (number: string, pin: string) => void
  onBack: () => void
  onClose: () => void
}) {
  const id = useId()
  const [number, setNumber] = useState('')
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<Step>('number')
  const [visible, setVisible] = useState(false)
  const [hint, setHint] = useState('')
  const [sent, setSent] = useState(false)
  const submitting = useRef(false)
  const field = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const normalized = mobileNumber(number)
  const validFormat = isValidPhMobile(number)
  const selected = validFormat ? accounts.find((row) => row.number === normalized) : undefined
  const locked = busy || sent

  useEffect(() => {
    if (step === 'review') heading.current?.focus({ preventScroll: true })
    else field.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    if (error) {
      submitting.current = false
      setSent(false)
      setPin('')
      setVisible(false)
      setStep('pin')
    }
  }, [error])

  function back() {
    if (locked) return
    setPin('')
    setVisible(false)
    setHint('')
    if (step === 'number') onBack()
    else setStep(step === 'review' ? 'pin' : 'number')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (locked || submitting.current) return
    setHint('')
    if (!validFormat) {
      setHint('Enter a valid 11-digit Philippine mobile number (09XXXXXXXXX).')
      return
    }
    if (!selected) {
      setHint('Enter a valid mobile number and try again.')
      return
    }
    if (step === 'number') {
      setStep('pin')
      return
    }
    if (!/^\d{4}$/.test(pin) || pin !== selected.pin) {
      setHint('PIN does not match this library wallet. Please try again.')
      return
    }
    if (step === 'pin') {
      setVisible(false)
      setStep('review')
      return
    }
    submitting.current = true
    setSent(true)
    const value = pin
    setPin('')
    onPay(selected.number, value)
  }

  const stepIndex = step === 'number' ? 0 : step === 'pin' ? 1 : 2
  const title = step === 'number' ? 'Enter mobile number' : step === 'pin' ? 'Enter PIN' : 'Confirm payment'
  const digitCount = normalized.length
  const badPrefix = digitCount >= 2 && !normalized.startsWith('09')

  return (
    <form className="wallet-checkout-card payment-surface" onSubmit={submit} autoComplete="off" aria-busy={locked}>
      <div className="wallet-merchant">
        <span className="payment-service-icon">
          <Wallet size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="payment-muted text-xs font-semibold uppercase tracking-wider">Payment to</p>
          <p className="font-display text-base font-bold">STI College Ormoc Library</p>
        </div>
        <strong className="wallet-merchant-amount">{paymentMoney(payment.totalCentavos)}</strong>
      </div>

      <div className="wallet-checkout-content" data-step={step}>
        <ol className="wallet-progress" aria-label="Payment steps">
          {(['number', 'pin', 'review'] as const).map((value, index) => {
            const completed = index < stepIndex
            const current = step === value
            return (
              <li
                key={value}
                aria-current={current ? 'step' : undefined}
                data-completed={completed ? 'true' : undefined}
              >
                <span aria-hidden="true">{completed ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
                {['Number', 'PIN', 'Review'][index]}
              </li>
            )
          })}
        </ol>

        <div>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p className="payment-muted mt-1 text-sm leading-6">
            {step === 'number'
              ? 'Enter your 11-digit Philippine mobile number (09XXXXXXXXX).'
              : step === 'pin'
                ? 'Enter your four-digit PIN to continue.'
                : 'Check the amount before continuing to secure payment.'}
          </p>
        </div>

        {step === 'number' ? (
          <div className="space-y-2">
            <div
              className="wallet-number-field"
              data-state={
                !digitCount ? 'idle' : validFormat ? 'valid' : badPrefix ? 'invalid' : 'typing'
              }
            >
              <span aria-hidden="true" className="wallet-ph-prefix">
                <Smartphone size={16} />
                PH
              </span>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Mobile number</span>
                <input
                  ref={field}
                  id={id + '-number'}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0917 000 0000"
                  value={number}
                  disabled={locked}
                  onChange={(event) => {
                    setNumber(sanitizePhInput(event.target.value))
                    setHint('')
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="payment-muted">11 digits only (Philippines format)</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold tabular-nums ${
                  !digitCount
                    ? 'bg-[var(--payment-soft)] text-[var(--payment-muted)]'
                    : validFormat
                      ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]'
                      : badPrefix
                        ? 'bg-[#fee2e2] text-[#b42318] dark:bg-[#991b1b]/30 dark:text-[#fca5a5]'
                        : 'bg-[#fef9c3] text-[#92400e] dark:bg-[#854d0e]/30 dark:text-[#fde047]'
                }`}
              >
                {badPrefix
                  ? 'Must start with 09'
                  : validFormat
                    ? '11 / 11 digits · Valid'
                    : `${digitCount} / 11 digits`}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="wallet-selected-number">
              <span className="payment-muted text-sm">Mobile number</span>
              <strong className="tabular-nums">{normalized}</strong>
            </div>
            {step === 'pin' ? (
              <div className="wallet-pin-panel">
                <label htmlFor={id + '-pin'} className="sr-only">
                  PIN
                </label>
                <div className="wallet-pin-entry">
                  <div className="wallet-pin-digits">
                    <input
                      ref={field}
                      id={id + '-pin'}
                      aria-label="PIN"
                      className="wallet-pin-input"
                      type={visible ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      value={pin}
                      disabled={locked}
                      onChange={(event) => {
                        setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
                        setHint('')
                      }}
                    />
                    <div className="wallet-pin-circles" aria-hidden="true">
                      {Array.from({ length: 4 }, (_, index) => (
                        <span
                          key={index}
                          className="wallet-pin-circle"
                          data-filled={Boolean(pin[index])}
                          data-current={index === pin.length}
                        >
                          {visible ? pin[index] : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="wallet-pin-visibility"
                  disabled={locked}
                  aria-label={visible ? 'Hide PIN' : 'Show PIN'}
                  onClick={() => setVisible((value) => !value)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span>{visible ? 'Hide PIN' : 'Show PIN'}</span>
                </button>
              </div>
            ) : (
              <dl className="wallet-review">
                <div>
                  <dt>Payment amount</dt>
                  <dd>{paymentMoney(payment.principalCentavos)}</dd>
                </div>
                <div>
                  <dt>Transaction fee</dt>
                  <dd>{paymentMoney(payment.feeCentavos)}</dd>
                </div>
                <div className="wallet-review-total">
                  <dt>Total to pay</dt>
                  <dd>{paymentMoney(payment.totalCentavos)}</dd>
                </div>
              </dl>
            )}
          </>
        )}

        {error || hint ? (
          <p role="alert" className="payment-error">
            {hint || error}
          </p>
        ) : null}

        <div className="wallet-checkout-actions">
          <Button
            className="payment-button wallet-primary-action"
            type="submit"
            disabled={locked || !number || (step === 'pin' && pin.length !== 4)}
          >
            <span>
              {locked
                ? 'Opening payment…'
                : step === 'number'
                  ? 'Next'
                  : step === 'pin'
                    ? 'Review payment'
                    : 'Pay ' + paymentMoney(payment.totalCentavos)}
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </Button>
          <p className="payment-trust-note">
            <ShieldCheck size={16} aria-hidden="true" className="text-[#16a34a]" />
            Secure checkout through Xendit.
          </p>
          <div className="wallet-secondary-actions">
            <Button className="payment-button" type="button" variant="ghost" disabled={locked} onClick={back}>
              <ArrowLeft size={17} aria-hidden="true" />
              Back
            </Button>
            <button type="button" className="wallet-cancel" disabled={locked} onClick={onClose}>
              Cancel payment
            </button>
          </div>
        </div>

        {step === 'number' ? (
          <details className="payment-optional wallet-accounts-box">
            <summary>Assigned library wallets</summary>
            <p>These credentials work only in this library flow. Never enter your personal GCash PIN here.</p>
            <table className="wallet-accounts">
              <caption className="sr-only">Assigned numbers and PINs</caption>
              <thead>
                <tr>
                  <th>Mobile number</th>
                  <th>PIN</th>
                  <th>
                    <span className="sr-only">Use number</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.number}>
                    <td>{row.number}</td>
                    <td>{row.pin}</td>
                    <td>
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center rounded-[6px] bg-[#0b5ea2]/10 px-3 text-xs font-semibold text-[#0b5ea2] transition-colors hover:bg-[#0b5ea2]/20 dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]"
                        disabled={locked}
                        onClick={() => {
                          setNumber(row.number)
                          setHint('')
                        }}
                      >
                        Fill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </div>
    </form>
  )
}
