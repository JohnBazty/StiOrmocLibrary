import { useEffect, useRef } from 'react'

export function useCatalogDialog(open: boolean, onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!open || !dialog.current) return
    const panel = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex="0"]')).filter(element => !element.hasAttribute('disabled') && !element.closest('[hidden]'))
    focusable()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const controls = focusable(), first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    panel.addEventListener('keydown', keyboard)
    return () => { panel.removeEventListener('keydown', keyboard); document.body.style.overflow = previousOverflow; if (opener?.isConnected) opener.focus() }
  }, [open])
  return dialog
}
