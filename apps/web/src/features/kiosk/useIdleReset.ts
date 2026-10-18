import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'click'] as const

/**
 * Calls onIdle after idleMs with no user activity. Any activity restarts the
 * timer. Inactive (e.g. on the idle screen itself) it does nothing.
 */
export function useIdleReset(idleMs: number, onIdle: () => void, active: boolean) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const restart = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onIdleRef.current(), idleMs)
    }
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, restart)
    restart()
    return () => {
      clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, restart)
    }
  }, [idleMs, active])
}
