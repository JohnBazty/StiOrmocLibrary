import { paymentMoney } from './payments-api'

export function RefundApproval({ total, checked, disabled, onChange }: {
  total: number; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void
}) {
  return <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-current/15 p-4 text-sm leading-6">
    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/>
    <span>I reviewed the original payment, refund reason and bill change. I approve returning <strong>{paymentMoney(total)}</strong>.</span>
  </label>
}
