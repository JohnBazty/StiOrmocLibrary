import { useEffect, useRef } from 'react'

/** Closes a modal drawer on Escape, unless an inner dialog already handled the key (preventDefault). */
export function useCloseOnEscape(onClose: () => void) {
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) latest.current()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])
}
