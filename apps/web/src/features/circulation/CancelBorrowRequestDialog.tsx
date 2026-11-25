import { useState } from 'react'
import { Button, FormField, LumoDialog, NoticeBanner } from '../../components/ui'

export function CancelBorrowRequestDialog({ title, busy, error, onCancel, onConfirm }: {
  title: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <LumoDialog
      eyebrow="Pending request"
      title="Cancel counter claim?"
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>Keep request</Button>
          <Button variant="danger" disabled={busy} onClick={() => onConfirm(reason)}>{busy ? 'Cancelling…' : 'Cancel request'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <NoticeBanner tone="warning" className="mb-0">
          Cancel <strong>{title}</strong>? Its physical copy will be released for other catalog users.
        </NoticeBanner>
        {error ? <NoticeBanner tone="error" className="mb-0">{error}</NoticeBanner> : null}
        <FormField id="cancel-borrow-reason" label="Reason (optional)">
          <textarea
            id="cancel-borrow-reason"
            value={reason}
            maxLength={255}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="sl-input"
            placeholder="Student cancelled or did not proceed"
          />
        </FormField>
      </div>
    </LumoDialog>
  )
}
