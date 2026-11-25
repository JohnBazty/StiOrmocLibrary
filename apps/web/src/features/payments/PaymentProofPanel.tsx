import { CheckCircle2, FileImage, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, NoticeBanner, StatusBadge } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'
import { notifyPaymentUpdate } from './payment-updates'
import { paymentRequest } from './payments-api'

type Proof = {
  proof_id: string
  external_reference: string
  declared_amount: string
  review_status: 'Pending' | 'Verified' | 'Rejected'
  review_reason?: string
  version: number
  created_at: string
}

export function PaymentProofPanel({
  paymentId,
  admin = false,
  defaultOpen = false,
  onUpdated,
}: {
  paymentId: string
  admin?: boolean
  defaultOpen?: boolean
  defaultAmount?: number | string
  onUpdated?: () => Promise<unknown> | void
}) {
  const path = `${admin ? 'admin' : 'user'}/payments`
  const [proofs, setProofs] = useState<Proof[]>([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const retry = useRef({ payload: '', key: crypto.randomUUID() })
  const saving = useRef(false)

  async function load() {
    setError('')
    try {
      const list = await paymentRequest<Proof[]>(`${path}/${paymentId}/proofs`)
      setProofs(list)
      if (list.length > 0) {
        setImage(`/api/v1/${path}/proofs/${list[0].proof_id}/image`)
      } else {
        setImage(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load payment proof.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [paymentId, admin])

  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function upload() {
    if (!file || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const signature = JSON.stringify([paymentId, file.name, file.size, file.lastModified])
      if (retry.current.payload !== signature) {
        retry.current = { payload: signature, key: crypto.randomUUID() }
      }
      const form = new FormData()
      form.append('receipt', file)
      form.append('request_key', retry.current.key)
      const headers = new Headers({ Accept: 'application/json' })
      const csrf = getCsrfToken()
      if (csrf) headers.set('X-CSRF-Token', csrf)
      const response = await fetch(`/api/v1/${path}/${paymentId}/proofs`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: form,
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Unable to upload payment proof.')
      setFile(null)
      setMessage('Receipt attached. Payment status still follows Xendit confirmation.')
      notifyPaymentUpdate()
      await load()
      await onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to upload payment proof.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function review(proof: Proof, status: 'Verified' | 'Rejected') {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' })
      const csrf = getCsrfToken()
      if (csrf) headers.set('X-CSRF-Token', csrf)
      const response = await fetch(`/api/v1/${path}/proofs/${proof.proof_id}/review`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ version: proof.version, status, reason }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message ?? 'Unable to review payment proof.')
      setReason('')
      notifyPaymentUpdate()
      await load()
      await onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to review payment proof.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const active = proofs.some((p) => p.review_status !== 'Rejected')

  return (
    <section className="mt-4 rounded-[12px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 text-sm shadow-[var(--sl-shadow-xs)]">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex rounded-[8px] bg-[#0b5ea2]/10 p-2 text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
          <FileImage size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold text-[var(--sl-text-header)]">GCash receipt</h3>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
            A receipt image supports payment review. Xendit confirms whether money was received.
          </p>
        </div>
      </div>

      {error ? <NoticeBanner tone="error" className="mt-3">{error}</NoticeBanner> : null}
      {message ? (
        <NoticeBanner tone="success" className="mt-3">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={15} aria-hidden="true" />
            {message}
          </span>
        </NoticeBanner>
      ) : null}

      {loading ? (
        <p className="mt-3 text-xs font-medium text-[var(--sl-text-secondary)]" role="status">
          Loading receipt…
        </p>
      ) : proofs.length === 0 ? (
        <p className="mt-3 rounded-[8px] border border-dashed border-[var(--sl-border-strong)] bg-[var(--sl-bg-subtle)]/40 px-3 py-2.5 text-xs text-[var(--sl-text-secondary)]">
          No receipt image attached.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {proofs.map((proof) => {
            const statusTone =
              proof.review_status === 'Verified'
                ? 'success'
                : proof.review_status === 'Rejected'
                  ? 'error'
                  : 'warning'
            return (
              <div
                key={proof.proof_id}
                className="rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge
                    status={proof.review_status === 'Pending' ? 'Awaiting review' : proof.review_status}
                    tone={statusTone}
                  />
                  <span className="font-display text-base font-bold tabular-nums text-[var(--sl-text-header)]">
                    ₱{Number(proof.declared_amount).toFixed(2)}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs font-medium text-[var(--sl-text-secondary)]">
                  Reference: <strong className="text-[var(--sl-text-header)]">{proof.external_reference}</strong>
                </p>
                {proof.review_reason ? (
                  <p className="mt-1.5 break-words text-xs text-[var(--sl-text-secondary)]">{proof.review_reason}</p>
                ) : null}
                {image === `/api/v1/${path}/proofs/${proof.proof_id}/image` ? (
                  <div className="mt-3 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-2.5">
                    <img
                      alt="Uploaded GCash payment receipt"
                      src={image}
                      className="mx-auto max-h-[55dvh] max-w-full rounded-[8px] object-contain"
                      onError={() => {
                        setError('Unable to load the private receipt image. Try again.')
                        setImage(null)
                      }}
                    />
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => setImage(`/api/v1/${path}/proofs/${proof.proof_id}/image`)}
                  >
                    View receipt image
                  </Button>
                )}
                {admin && proof.review_status === 'Pending' ? (
                  <div className="mt-4 border-t border-[var(--sl-border)] pt-3.5">
                    <label className="block text-xs font-semibold text-[var(--sl-text-header)]">
                      Review note
                      <textarea
                        className="sl-input mt-1.5 min-h-20 resize-none"
                        value={reason}
                        maxLength={1000}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <p className="mt-1.5 text-xs text-[var(--sl-text-muted)]">
                      Verify only after the provider reference and full payment amount match. This review will not apply another payment.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button disabled={busy || reason.trim().length < 3} onClick={() => void review(proof, 'Verified')}>
                        Verify receipt
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy || reason.trim().length < 3}
                        onClick={() => void review(proof, 'Rejected')}
                      >
                        Reject receipt
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {!admin && !active && !loading ? (
        <details open={defaultOpen} className="mt-4 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/35 p-3.5">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0b5ea2] dark:text-[#93c5fd]">
            <Upload size={15} aria-hidden="true" />
            Upload GCash receipt
          </summary>
          <div className="mt-3 space-y-3.5">
            <label className="block text-xs font-semibold text-[var(--sl-text-header)]">
              Receipt image <span className="font-normal text-[var(--sl-text-muted)]">(PNG or JPEG, up to 3 MB)</span>
              <input
                className="mt-1.5 block w-full rounded-[8px] border border-dashed border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] p-2.5 text-xs text-[var(--sl-text-secondary)] file:mr-3 file:rounded-[6px] file:border-0 file:bg-[#0b5ea2] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#094e87]"
                type="file"
                accept="image/png,image/jpeg"
                disabled={busy}
                onChange={(e) => {
                  const chosen = e.target.files?.[0]
                  setError('')
                  if (chosen && chosen.size > 3 * 1024 * 1024) {
                    setError('Choose a receipt image up to 3 MB.')
                    setFile(null)
                    return
                  }
                  setFile(chosen ?? null)
                }}
              />
            </label>
            {preview ? (
              <img
                alt="Receipt to upload"
                src={preview}
                className="mx-auto max-h-72 max-w-full rounded-[8px] border border-[var(--sl-border)] object-contain shadow-[var(--sl-shadow-xs)]"
              />
            ) : null}
            <Button
              className="w-full sm:w-auto"
              disabled={busy || !file}
              onClick={() => void upload()}
            >
              {busy ? 'Uploading…' : 'Attach receipt for review'}
            </Button>
          </div>
        </details>
      ) : null}
    </section>
  )
}
