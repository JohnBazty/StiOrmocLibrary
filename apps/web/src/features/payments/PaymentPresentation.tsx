import { AlertCircle, Check, Clock3, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { cn } from '../../components/ui'
import type { Payment } from './payments-api'
import './payments.css'

export function PaymentStateIcon({ state, large = false }: { state: string; large?: boolean }) {
  const success = state === 'Succeeded' || state === 'Issued'
  const neutral = ['Expired', 'Cancelled', 'Reversed'].includes(state)
  const Icon = success ? Check : state === 'Review' ? AlertCircle : neutral ? X : Clock3
  return <span className={cn('payment-state-icon', success && 'payment-state-success', neutral && 'payment-state-neutral', state === 'Review' && 'payment-state-review', large && 'payment-state-large')}><Icon size={large ? 30 : 18} aria-hidden="true"/></span>
}

export function PaymentTrustNote() {
  return <p className="payment-trust-note"><ShieldCheck size={16} aria-hidden="true"/>Payment details handled securely by Xendit</p>
}

export function PaymentEmptyIcon() {
  return <span className="payment-empty-icon"><ReceiptText size={28} aria-hidden="true"/></span>
}
