import { useEffect, useRef } from 'react'

export function DeviceSwitchPrompt({ busy, onConfirm, onCancel }: {
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return (
    <section aria-labelledby="device-switch-heading" className="mt-7 space-y-4">
      <h2 id="device-switch-heading" tabIndex={-1} ref={heading} className="text-lg font-bold">This account is signed in on another device.</h2>
      <p className="text-sm">Switching will sign out the other device. Cancel to leave it signed in.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 rounded-xl bg-[#0b5ea2] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Switching…' : 'Switch to this device'}</button>
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">Cancel</button>
      </div>
    </section>
  )
}
