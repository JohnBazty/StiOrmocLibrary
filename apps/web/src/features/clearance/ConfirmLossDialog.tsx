import { useState } from 'react'
import { Button, LumoDialog } from '../../components/ui'

export type LossChoice = { resolution: 'Pay' | 'Replace'; bookPrice: number | null }

const peso = (value: number) => `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Before a loss is confirmed the librarian chooses how it is settled: the borrower pays the book
 * price (entered or confirmed here) or brings a replacement copy of the same book.
 */
export function ConfirmLossDialog({ title, suggestedPrice, busy, error, onCancel, onConfirm }: {
  title: string
  /** The listed book price, else the supplier quotation; prefilled for the librarian to confirm or correct. */
  suggestedPrice: number | null
  busy: boolean
  error?: string
  onCancel: () => void
  onConfirm: (choice: LossChoice) => void
}) {
  const [resolution, setResolution] = useState<'Pay' | 'Replace'>('Pay')
  const [price, setPrice] = useState(suggestedPrice ? suggestedPrice.toFixed(2) : '')
  const text = price.trim()
  const amount = text ? Number(text) : null
  const priceError = resolution === 'Pay' && text && !(amount !== null && Number.isFinite(amount) && amount > 0 && amount <= 1_000_000)
    ? 'Enter the book price as a positive amount, or leave it blank to charge later.' : ''
  const label = resolution === 'Replace'
    ? 'Confirm loss, wait for replacement'
    : amount && !priceError ? `Confirm loss and charge ${peso(amount)}` : 'Confirm loss, charge later'
  return (
    <LumoDialog
      size="sm"
      title="Confirm lost book"
      description={`${title}. Choose how the borrower settles this loss.`}
      busy={busy}
      onClose={onCancel}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || Boolean(priceError)} onClick={() => onConfirm({ resolution, bookPrice: resolution === 'Pay' && amount ? Math.round(amount * 100) / 100 : null })}>{busy ? 'Saving…' : label}</Button>
      </>}
    >
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="sr-only">How is this loss settled?</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--sl-border)] p-3 text-sm">
          <input type="radio" name="loss-resolution" className="mt-1" checked={resolution === 'Pay'} onChange={() => setResolution('Pay')} />
          <span><span className="block font-semibold">Pay book price</span><span className="block text-xs text-[var(--sl-text-secondary)]">The borrower pays the price below. No extra fee is added.</span></span>
        </label>
        {resolution === 'Pay' ? (
          <label className="block pl-1 text-sm font-semibold">Book price (PHP)
            <input
              className="mt-1 block min-h-11 w-full rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-sm"
              inputMode="decimal"
              value={price}
              aria-invalid={priceError ? true : undefined}
              onChange={event => setPrice(event.target.value)}
              placeholder="e.g. 450.00"
            />
            {priceError ? <span role="alert" className="mt-1 block text-xs text-[#b42318]">{priceError}</span> : null}
          </label>
        ) : null}
        <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--sl-border)] p-3 text-sm">
          <input type="radio" name="loss-resolution" className="mt-1" checked={resolution === 'Replace'} onChange={() => setResolution('Replace')} />
          <span><span className="block font-semibold">Replace copy</span><span className="block text-xs text-[var(--sl-text-secondary)]">The borrower brings a copy of the same book. No charge; clearance waits until it arrives.</span></span>
        </label>
      </fieldset>
      {error ? <p role="alert" className="mt-3 text-sm text-[#b42318]">{error}</p> : null}
    </LumoDialog>
  )
}
