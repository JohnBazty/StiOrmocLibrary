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
  return (
    <details
      ref={disclosure}
      name="admin-row-actions"
      className="group w-48 max-w-full"
      onKeyDown={event => {
        if (event.key === 'Escape' && disclosure.current?.open) {
          event.stopPropagation()
          close(true)
        }
      }}
    >
      <summary
        ref={trigger}
        aria-label={label}
        className="flex min-h-[36px] cursor-pointer list-none items-center justify-between gap-2 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] dark:border-white/20 dark:bg-[#232634] dark:text-[#f7f9ff] dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden"
      >
        Actions <ChevronDown size={15} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div
        className="mt-1 grid gap-0.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1 shadow-[var(--sl-shadow-m)] [&>a]:flex [&>a]:min-h-[36px] [&>a]:w-full [&>a]:items-center [&>a]:justify-start [&>a]:gap-2 [&>a]:whitespace-normal [&>a]:rounded-[5px] [&>a]:px-2.5 [&>a]:py-1.5 [&>a]:text-left [&>a]:text-xs [&>a]:font-medium [&>a]:text-[var(--sl-text)] [&>a]:hover:bg-[var(--sl-bg-hover)] [&>button]:flex [&>button]:min-h-[36px] [&>button]:w-full [&>button]:items-center [&>button]:justify-start [&>button]:gap-2 [&>button]:whitespace-normal [&>button]:rounded-[5px] [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:text-left [&>button]:text-xs [&>button]:font-medium [&>button]:text-[var(--sl-text)] [&>button]:hover:bg-[var(--sl-bg-hover)] [&>button:disabled]:opacity-45"
        onClick={event => {
          const control = event.target instanceof Element ? event.target.closest('button, a') : null
          if (control && !control.hasAttribute('disabled')) close(true)
        }}
      >
        {children}
      </div>
    </details>
  )
}
