import { useEffect, useRef } from 'react'
import { Button } from '../components/ui'

export function SignOutDialog({ busy, error, onCancel, onConfirm }: {
  busy: boolean; error: string; onCancel: () => void; onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const modal = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal?.showModal()
    cancel.current?.focus()
    return () => {
      modal?.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return <dialog ref={dialog} role="alertdialog" aria-labelledby="signout-title" aria-describedby="signout-description" aria-modal="true"
    className="portal-signout-dialog rounded-2xl border border-[#0b5ea2]/15 bg-white p-6 text-[#0b5ea2] shadow-xl dark:border-white/15 dark:bg-[#22232e] dark:text-[#f2f6ff]"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id="signout-title" className="text-xl font-bold">Sign out</h2>
    <p id="signout-description" className="mt-3 text-sm">Are you sure you want to sign out?</p>
    {error ? <p role="alert" className="mt-3 text-sm font-semibold">{error}</p> : null}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-current/20 px-4 text-sm font-semibold disabled:opacity-45">Cancel</button>
      <Button disabled={busy} onClick={onConfirm}>{busy ? 'Signing out…' : 'Sign out'}</Button>
    </div>
  </dialog>
}
