import { AlertTriangle, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import type { PreflightFinding } from './types'

const REASON_MIN = 10
const REASON_MAX = 500

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
  const trimmed = reason.trim().replace(/\s+/g, ' ')
  const reasonReady = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="checkout-preflight-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-[#003399]/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#003399]/15 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#003399]">Staff confirmation required</p>
            <h2 id="checkout-preflight-title" className="mt-1 text-xl font-black text-[#003399]">Review warnings before checkout</h2>
          </div>
          <button type="button" disabled={busy} aria-label="Close confirmation" onClick={onCancel} className="rounded-xl p-2 text-[#003399] disabled:opacity-40">
            <X size={19} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="flex gap-3 rounded-xl bg-[#FFF200] p-4 text-[#003399]">
            <ShieldAlert className="shrink-0" size={19} aria-hidden="true" />
            <p className="text-sm">
              Checkout for <strong>{title}</strong> needs a recorded reason before it can continue.
            </p>
          </div>
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={warning.code} className="flex gap-3 rounded-xl border border-[#003399]/15 bg-[#FFFFFF] p-3 text-sm text-[#003399]">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <div>
                  <p className="font-bold">{warning.code.replace(/_/g, ' ')}</p>
                  <p className="mt-1">{warning.message}</p>
                </div>
              </li>
            ))}
          </ul>
          {error ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
          <label className="block text-xs font-bold uppercase text-[#003399]">
            Override reason (required)
            <textarea
              value={reason}
              maxLength={REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#003399]/20 p-3 text-sm font-normal text-[#003399] outline-none focus:border-[#003399]"
              placeholder="Explain why this copy is safe to lend"
            />
            <span className="mt-1 block text-[11px] font-semibold normal-case text-[#003399]/70">
              {trimmed.length}/{REASON_MAX} characters (minimum {REASON_MIN})
            </span>
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#003399]/15 p-4">
          <button type="button" disabled={busy} onClick={onCancel} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">
            Cancel checkout
          </button>
          <button
            type="button"
            disabled={busy || !reasonReady}
            onClick={() => onConfirm(trimmed)}
            className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Confirming…' : 'Confirm with reason'}
          </button>
        </footer>
      </div>
    </div>
  )
}
