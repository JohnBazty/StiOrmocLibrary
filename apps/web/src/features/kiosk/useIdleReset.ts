import { useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'click'] as const

/**
 * Calls onIdle after idleMs with no user activity. Any activity restarts the
 * timer. Returns true during the last warnMs before the reset so the kiosk can
 * warn the user first (WCAG 2.2.1 Timing Adjustable). Inactive (e.g. on the
 * idle screen itself) it does nothing.
 */
export function useIdleReset(idleMs: number, onIdle: () => void, active: boolean, warnMs = 20000): boolean {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    setWarning(false)
    if (!active) return
    let warnTimer: ReturnType<typeof setTimeout>
    let resetTimer: ReturnType<typeof setTimeout>
    const restart = () => {
      clearTimeout(warnTimer)
      clearTimeout(resetTimer)
      setWarning(false)
      if (warnMs < idleMs) warnTimer = setTimeout(() => setWarning(true), idleMs - warnMs)
      resetTimer = setTimeout(() => onIdleRef.current(), idleMs)
    }
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, restart)
    restart()
    return () => {
      clearTimeout(warnTimer)
      clearTimeout(resetTimer)
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, restart)
    }
  }, [idleMs, warnMs, active])

  return warning
}
