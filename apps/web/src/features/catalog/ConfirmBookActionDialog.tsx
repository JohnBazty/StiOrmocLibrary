import { Button, LumoDialog } from '../../components/ui'

export function ConfirmBookActionDialog({
  kind, title, onCancel, onConfirm,
}: {
  kind: 'borrow' | 'reserve'
  title: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const borrow = kind === 'borrow'

  return (
    <LumoDialog
      role="alertdialog"
      size="sm"
      title={borrow ? 'Add this book to your borrow cart?' : 'Reserve this book?'}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="smartlib-button inline-flex min-h-[38px] items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--sl-text-header)] transition-colors hover:bg-[var(--sl-bg-hover)]"
          >
            Cancel
          </button>
          <Button onClick={onConfirm}>
            {borrow ? 'Add to cart' : 'Reserve book'}
          </Button>
        </>
      }
    >
      <p className="text-sm font-semibold text-[var(--sl-text-header)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--sl-text-secondary)]">
        {borrow
          ? 'This adds the book to your cart. It is not borrowed yet. Review your cart and send it to the desk. Staff confirm the loan when you collect the copy.'
          : 'No copy can be borrowed right now. This joins the waiting list. We will notify you when a copy is ready. The pickup time starts only after staff mark that copy ready.'}
      </p>
    </LumoDialog>
  )
}
