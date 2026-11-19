import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Button, FormField, LumoDialog, NoticeBanner } from '../../components/ui'
import type { PreflightFinding } from './types'

const REASON_MIN = 10
const REASON_MAX = 500

function readableWarningTitle(code: string) {
  const words = code.toLowerCase().replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Checkout warning'
}

export function CheckoutPreflightDialog({
  title,
  warnings,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  warnings: PreflightFinding[]
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const trimmed = reason.trim().replace(/\s+/g, ' ')
  const reasonReady = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX
  const inlineError = touched && !reasonReady ? `Enter at least ${REASON_MIN} characters explaining why this copy is safe to lend.` : undefined

  return (
    <LumoDialog
      eyebrow="Staff confirmation required"
      title="Review warnings before checkout"
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel checkout
          </Button>
          <Button disabled={busy || !reasonReady} onClick={() => onConfirm(trimmed)}>
            {busy ? 'Confirming…' : 'Confirm with reason'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NoticeBanner tone="warning" className="mb-0">
          <span className="inline-flex items-start gap-2">
            <ShieldAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            <span>
              Checkout for <strong>{title}</strong> requires a documented reason before continuing.
            </span>
          </span>
        </NoticeBanner>
        <ul className="space-y-2">
          {warnings.map(warning => (
            <li
              key={warning.code}
              className="flex gap-2.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 shrink-0 text-[#b45309] dark:text-[#fcd34d]" size={16} aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-[var(--sl-text-header)]">{readableWarningTitle(warning.code)}</p>
                <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{warning.message}</p>
              </div>
            </li>
          ))}
        </ul>
        {error ? (
          <NoticeBanner tone="error" className="mb-0">
            {error}
          </NoticeBanner>
        ) : null}
        <FormField
          id="checkout-override-reason"
          label="Override reason"
          required
          error={inlineError}
          helperText={`${trimmed.length}/${REASON_MAX} characters (minimum ${REASON_MIN})`}
        >
          <textarea
            id="checkout-override-reason"
            value={reason}
            maxLength={REASON_MAX}
            aria-invalid={Boolean(inlineError)}
            onBlur={() => setTouched(true)}
            onChange={event => setReason(event.target.value)}
            rows={3}
            className="sl-input min-h-[84px] py-2"
            placeholder="Explain why this copy is safe to lend"
          />
        </FormField>
      </div>
    </LumoDialog>
  )
}
