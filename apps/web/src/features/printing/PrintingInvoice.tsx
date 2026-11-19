import { useState } from 'react'
import { printingApi, type PrintRequest } from './printing-api'

export function PrintingInvoice({ request, admin = false }: { request: PrintRequest; admin?: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    setError('')
    try {
      await printingApi.downloadInvoice(request, admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invoice could not be downloaded.')
    } finally {
      setBusy(false)
    }
  }

  const cancelled = request.job_status === 'Cancelled'
  const paid = request.payment_status === 'Paid'
  const refunding = request.payment_status === 'Refund pending'
  const statusLabel =
    request.payment_status === 'Refunded'
      ? 'Refunded'
      : request.payment_status === 'Refund pending'
        ? 'Refund pending'
        : cancelled
          ? 'Cancelled'
          : paid
            ? 'Paid'
            : request.payment_status

  const helperCopy = refunding
    ? admin
      ? 'A refund is awaiting confirmation. Do not collect payment again.'
      : 'A refund is awaiting confirmation. Do not pay this bill again.'
    : cancelled
      ? 'This request is cancelled.'
      : paid
        ? admin
          ? 'Payment recorded. Payment confirmation is available separately.'
          : 'Payment recorded. Your payment confirmation is available separately.'
        : request.pricing_review_state && request.pricing_review_state !== 'Ready'
          ? 'The price needs confirmation before payment.'
          : admin
            ? 'Requester bill before payment. Collect cash at the desk or wait for online payment.'
            : 'This is your bill before payment. Choose an available payment option.'

  return (
    <details className="mt-2 min-w-0 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-2.5 text-left">
      <summary className="min-h-8 cursor-pointer text-xs font-semibold text-[var(--sl-text-header)]">
        Invoice · PRINT-INV-{String(request.request_id).padStart(8, '0')} · {statusLabel}
      </summary>
      <div className="mt-2.5 space-y-2 text-xs text-[var(--sl-text)]">
        <p className="break-words font-semibold text-[var(--sl-text-header)]">{request.file_name}</p>
        <p>
          {request.page_count} pages × {request.number_of_copies} copies = {request.total_sheets} sheets
        </p>
        <p className="text-[var(--sl-text-secondary)]">
          {request.service_kind ?? 'Print'} · {request.output_mode ?? request.print_type} · {request.paper_size}
        </p>
        {request.paper_brand_snapshot ? <p>Paper brand: {request.paper_brand_snapshot}</p> : null}
        {request.pricing_review_state && request.pricing_review_state !== 'Ready' ? (
          <p className="font-semibold text-[var(--sl-warning-text)]">
            Estimate ·{' '}
            {request.pricing_review_state === 'Pending'
              ? 'Waiting for staff review'
              : admin
                ? 'Waiting for requester price confirmation'
                : 'Waiting for your price confirmation'}
          </p>
        ) : null}
        {request.pricing_snapshot ? (
          <div className="space-y-1 text-xs text-[var(--sl-text-secondary)]">
            <p>Base printing: ₱{(request.pricing_snapshot.baseCentavos / 100).toFixed(2)}</p>
            <p>Image-page additions: ₱{(request.pricing_snapshot.imageCentavos / 100).toFixed(2)}</p>
            <p>Color pages: {request.pricing_snapshot.coloredPages.join(', ') || 'None'}</p>
          </div>
        ) : null}
        <dl className="flex flex-wrap justify-between gap-3 border-t border-[var(--sl-border)] pt-2.5">
          <div>
            <dt className="text-[var(--sl-text-muted)]">Total charge</dt>
            <dd className="font-bold tabular-nums text-[var(--sl-text-header)]">
              ₱{Number(request.calculated_cost).toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--sl-text-muted)]">Amount due</dt>
            <dd className="font-bold tabular-nums text-[var(--sl-text-header)]">
              ₱{cancelled || paid || refunding ? '0.00' : Number(request.balance ?? request.calculated_cost).toFixed(2)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-[var(--sl-text-secondary)]">{helperCopy}</p>
        {error ? (
          <p role="alert" className="auth-error rounded-[6px] p-2">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-9 items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-xs font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-hover)] disabled:opacity-50"
          onClick={() => void download()}
        >
          {busy ? 'Downloading…' : 'Download invoice PDF'}
        </button>
      </div>
    </details>
  )
}
