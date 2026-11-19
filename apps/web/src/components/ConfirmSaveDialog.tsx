import { useState } from 'react'
import { Button, LumoDialog } from './ui'

export type ConfirmSaveOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
}

export function ConfirmSaveDialog({
  title = 'Are you sure?',
  detail,
  confirmLabel = 'Yes, save',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onCancel,
  onConfirm,
}: {
  title?: string
  detail: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <LumoDialog
      role="alertdialog"
      size="sm"
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="smartlib-button inline-flex min-h-[38px] items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--sl-text-header)] transition-colors hover:bg-[var(--sl-bg-hover)]"
          >
            {cancelLabel}
          </button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--sl-text)]">{detail}</p>
    </LumoDialog>
  )
}

export function useConfirmSave() {
  const [request, setRequest] = useState<(ConfirmSaveOptions & { detail: string; run: () => void }) | null>(null)
  function ask(detail: string, run: () => void, options?: ConfirmSaveOptions) {
    setRequest({ detail, run, ...options })
  }
  const dialog = request ? (
    <ConfirmSaveDialog
      title={request.title}
      detail={request.detail}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      tone={request.tone}
      onCancel={() => setRequest(null)}
      onConfirm={() => {
        const run = request.run
        setRequest(null)
        run()
      }}
    />
  ) : null
  return { ask, dialog }
}
