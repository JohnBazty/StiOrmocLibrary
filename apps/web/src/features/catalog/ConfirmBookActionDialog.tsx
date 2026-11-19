import { useEffect } from 'react'

export function ConfirmBookActionDialog({
  kind, title, onCancel, onConfirm,
}: {
  kind: 'borrow' | 'reserve'
  title: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const borrow = kind === 'borrow'
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0b5ea2]/60 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-book-action-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0b5ea2] shadow-2xl">
        <h2 id="confirm-book-action-title" className="font-display text-xl font-bold">{borrow ? 'Are you sure you want to add this book?' : 'Are you sure you want to reserve this book?'}</h2>
        <p className="mt-3 text-sm font-bold leading-6">{title}</p>
        <p className="mt-2 text-sm leading-6">{borrow
          ? 'This adds the book to your cart. It is not borrowed yet. Review your cart and send it to the desk. Staff confirm the loan when you collect the copy.'
          : 'No copy can be borrowed right now. This joins the waiting list. We will notify you when a copy is ready. The pickup time starts only after staff mark that copy ready.'}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className="h-11 rounded-xl border border-[#0b5ea2]/20 px-5 text-sm font-bold">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white">{borrow ? 'Add to cart' : 'Reserve book'}</button>
        </div>
      </section>
    </div>
  )
}
