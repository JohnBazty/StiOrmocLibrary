import { Button, LumoDialog } from '../../components/ui'
import { titleAlreadyActiveMessage } from './book-cart'

export function TitleAlreadyActiveDialog({ titles, onClose }: { titles: string[]; onClose: () => void }) {
  const message = titles.length === 1
    ? titleAlreadyActiveMessage(titles[0])
    : `You already have these books: ${titles.join(', ')}. Another copy of the same book cannot be borrowed while it is on an active loan or request.`
  return (
    <LumoDialog
      size="sm"
      title="You already have this book"
      onClose={onClose}
      footer={
        <>
          <a
            href="../my-books"
            className="smartlib-button inline-flex min-h-[38px] items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--sl-text-header)] transition-colors hover:bg-[var(--sl-bg-hover)]"
          >
            View my books
          </a>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-[var(--sl-text)]">{message}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--sl-text-secondary)]">
        Find it in My books or Borrowing history.
      </p>
    </LumoDialog>
  )
}
