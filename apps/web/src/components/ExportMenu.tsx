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

  return <details ref={disclosure} className="group max-w-full" onKeyDown={event => {
    if (event.key === 'Escape' && disclosure.current?.open) {
      event.stopPropagation()
      close(true)
    }
  }}>
    <summary ref={trigger} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#003399]/20 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20 [&::-webkit-details-marker]:hidden">
      <Download size={16} aria-hidden="true" />{label}<ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-[#003399]/15 bg-white p-2 dark:border-white/20 dark:bg-[#001a4d]">
      {exports.map(choice => <Button key={choice.label} variant="secondary" disabled={choice.disabled} onClick={() => {
        if (choice.disabled) return
        close(true)
        choice.onSelect()
      }}>{choice.label}</Button>)}
    </div>
  </details>
}
