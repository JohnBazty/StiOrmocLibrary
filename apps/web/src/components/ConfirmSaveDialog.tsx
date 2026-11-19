import { useState } from 'react'

export function ConfirmSaveDialog({ detail, onCancel, onConfirm }: { detail: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#0b5ea2]/60 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-save-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0b5ea2] shadow-2xl">
        <h2 id="confirm-save-title" className="font-display text-xl font-bold">Are you sure?</h2>
        <p className="mt-3 text-sm leading-6">{detail}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className="h-11 rounded-xl border border-[#0b5ea2]/20 px-5 text-sm font-bold">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white">Yes, save</button>
        </div>
      </section>
    </div>
  )
}

export function useConfirmSave() {
  const [request, setRequest] = useState<{ detail: string; run: () => void } | null>(null)
  function ask(detail: string, run: () => void) {
    setRequest({ detail, run })
  }
  const dialog = request
    ? <ConfirmSaveDialog detail={request.detail} onCancel={() => setRequest(null)} onConfirm={() => { const run = request.run; setRequest(null); run() }} />
    : null
  return { ask, dialog }
}
