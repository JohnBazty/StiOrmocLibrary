import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** Native disclosure keeps actions in table flow, including on narrow screens. */
export function RowActions({ label, children }: { label: string; children: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  function close(restoreFocus = false) {
    if (disclosure.current) disclosure.current.open = false
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !disclosure.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  return <details ref={disclosure} name="admin-row-actions" className="group w-48 max-w-full" onKeyDown={event => {
    if (event.key === 'Escape' && disclosure.current?.open) { event.stopPropagation(); close(true) }
  }}>
    <summary ref={trigger} aria-label={label} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-[#0b5ea2]/20 px-3 py-2 text-sm font-semibold text-[#0b5ea2] hover:bg-[#0b5ea2]/5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20 dark:text-white dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
      Actions <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
    </summary>
    <div className="mt-1 grid gap-1 rounded-lg border border-[#0b5ea2]/15 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-[#001a4d] [&>button]:flex [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-start [&>button]:gap-2 [&>button]:whitespace-normal [&>button]:rounded-md [&>button]:px-3 [&>button]:py-2 [&>button]:text-left [&>button]:text-sm" onClick={event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      if (button && !button.disabled) close(true)
    }}>{children}</div>
  </details>
}
