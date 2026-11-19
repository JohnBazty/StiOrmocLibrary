import { useEffect, useRef } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { Button } from './ui'

type ExportChoice = { label: string; onSelect: () => void; disabled?: boolean }

export function ExportMenu({ label = 'Export filtered results', exports, disabled = false }: {
  label?: string
  exports: ExportChoice[]
  disabled?: boolean
}) {
  const disclosure = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  function close(restoreFocus = false) {
    if (disclosure.current) disclosure.current.open = false
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !disclosure.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  if (disabled) return <Button variant="secondary" disabled><Download size={16} aria-hidden="true" />{label}</Button>

  return <details ref={disclosure} className="group relative max-w-full" onKeyDown={event => {
    if (event.key === 'Escape' && disclosure.current?.open) {
      event.stopPropagation()
      close(true)
    }
  }}>
    <summary ref={trigger} className="smartlib-button flex min-h-[38px] cursor-pointer list-none items-center gap-2 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] dark:border-white/20 dark:bg-[#232634] dark:text-[#f7f9ff] dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
      <Download size={15} aria-hidden="true" />{label}<ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" />
    </summary>
    <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-2 shadow-[var(--sl-shadow-m)] sm:absolute sm:left-0 sm:top-full sm:z-30 sm:min-w-max">
      {exports.map(choice => <Button key={choice.label} variant="secondary" size="sm" disabled={choice.disabled} onClick={() => {
        if (choice.disabled) return
        close(true)
        choice.onSelect()
      }}>{choice.label}</Button>)}
    </div>
  </details>
}
