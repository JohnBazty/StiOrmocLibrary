import { Button, LumoDialog, NoticeBanner } from '../../components/ui'

export function ReportLostDialog({ title, busy, error, onCancel, onConfirm }: {
  title: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <LumoDialog
      title="Report this book as lost?"
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>Keep book record</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Submitting…' : 'Submit lost report'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <NoticeBanner tone="warning" className="mb-0">
          Report <strong>{title}</strong> as lost? Library staff will review the report before confirming any replacement charge.
        </NoticeBanner>
        {error ? <NoticeBanner tone="error" className="mb-0">{error}</NoticeBanner> : null}
      </div>
    </LumoDialog>
  )
}
