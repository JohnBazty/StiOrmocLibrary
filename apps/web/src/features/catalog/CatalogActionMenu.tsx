import { Archive, ArrowRightLeft, MoreHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export function CatalogActionMenu({ title, onCategory, onQuotation, onArchive }: {
  title: string; onCategory: () => void; onQuotation?: () => void; onArchive?: () => void
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = (restoreFocus = false) => { setPosition(null); if (restoreFocus) trigger.current?.focus() }
  const open = () => {
    const rect = trigger.current!.getBoundingClientRect()
    const height = 16 + 44 * (1 + Number(Boolean(onQuotation)) + Number(Boolean(onArchive)))
    setPosition({ left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)), top: rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4) })
  }
  useEffect(() => {
    if (!position) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null)
    }
    const dismiss = () => setPosition(null)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [position])
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'Tab') close()
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }
  }
  const choose = (action: () => void) => { close(true); action() }
  return <>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} aria-label={`More actions for ${title}`} onClick={() => position ? close() : open()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); open() } }} className="catalog-action-trigger inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#0b5ea2]/20 text-[#0b5ea2]"><MoreHorizontal size={16} /></button>
    {position ? createPortal(<div id={id} ref={menu} role="menu" aria-label={`Actions for ${title}`} className="catalog-action-menu" style={position} onKeyDown={keyboard}>
      <button type="button" role="menuitem" onClick={() => choose(onCategory)}><ArrowRightLeft size={15} />Change category</button>
      {onQuotation ? <button type="button" role="menuitem" onClick={() => choose(onQuotation)}>Supplier quotations</button> : null}
      {onArchive ? <button type="button" role="menuitem" onClick={() => choose(onArchive)}><Archive size={15} />Archive book</button> : null}
    </div>, document.body) : null}
  </>
}
