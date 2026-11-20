import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

type Props = {
  /** Reloads the data. A returned promise keeps the button busy until it settles. */
  onRefresh: () => unknown
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

const CONFIRM_MS = 2500

/** One refresh control for every page: busy while reloading, then a short spoken and visible "Updated". */
export function RefreshButton({ onRefresh, label = 'Refresh', variant = 'secondary', size = 'md', disabled = false, className }: Props) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false; if (timer.current) clearTimeout(timer.current) }, [])
  async function run() {
    if (busy || disabled) return
    if (timer.current) clearTimeout(timer.current)
    setBusy(true); setNote('')
    let message = 'Updated'
    try { await onRefresh() } catch { message = 'Could not refresh. Try again.' }
    if (!mounted.current) return
    setBusy(false); setNote(message)
    timer.current = setTimeout(() => { if (mounted.current) setNote('') }, CONFIRM_MS)
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant={variant} size={size} className={className} disabled={disabled || busy} onClick={() => void run()}>
        <RefreshCw size={size === 'sm' ? 14 : 16} aria-hidden="true" className={busy ? 'animate-spin motion-reduce:animate-none' : undefined} />
        {busy ? 'Refreshing…' : label}
      </Button>
      {note ? <span role="status" aria-live="polite" className="text-xs text-[var(--sl-text-secondary)] dark:text-white/70">{note}</span> : null}
    </span>
  )
}
