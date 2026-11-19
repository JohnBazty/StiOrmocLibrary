import { titleAlreadyActiveMessage } from './book-cart'

export function TitleAlreadyActiveDialog({ titles, onClose }: { titles: string[]; onClose: () => void }) {
  const message = titles.length === 1
    ? titleAlreadyActiveMessage(titles[0])
    : `You already have these books: ${titles.join(', ')}. Another copy of the same book cannot be borrowed while it is on an active loan or request.`
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b5ea2]/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="already-have-book-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0b5ea2] shadow-2xl">
        <h2 id="already-have-book-title" className="font-display text-xl font-bold">You already have this book</h2>
        <p className="mt-3 text-sm leading-6">{message}</p>
        <p className="mt-2 text-sm leading-6">Find it in My books or Borrowing history.</p>
        <div className="mt-5 flex justify-end">
          <button type="button" autoFocus onClick={onClose} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white">OK</button>
        </div>
      </section>
    </div>
  )
}
