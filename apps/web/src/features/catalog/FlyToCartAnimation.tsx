import { useEffect, useState } from 'react'
import { BookCoverThumbnail } from './BookCoverThumbnail'

export interface FlyToCartPayload {
  title: string
  coverImagePath?: string | null
  fromX?: number
  fromY?: number
}

interface ActiveFlight {
  id: number
  title: string
  coverImagePath?: string | null
  startX: number
  startY: number
  dx: number
  dy: number
}

type Listener = (payload: FlyToCartPayload) => void
const listeners = new Set<Listener>()
let nextFlightId = 1

export function triggerFlyToCart(payload: FlyToCartPayload) {
  listeners.forEach((listener) => listener(payload))
}

function findCartTargetCenter(): { x: number; y: number } {
  if (typeof document === 'undefined') return { x: 0, y: 0 }
  // Prefer the visible header Book cart button or floating Review cart pill
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target="true"]'))
  for (const el of candidates) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
  }
  return { x: window.innerWidth - 96, y: 96 }
}

export function FlyToCartOverlay() {
  const [flights, setFlights] = useState<ActiveFlight[]>([])

  useEffect(() => {
    const handleFly: Listener = (payload) => {
      if (typeof window === 'undefined') return
      const startX = payload.fromX ?? window.innerWidth / 2
      const startY = payload.fromY ?? window.innerHeight / 2
      const target = findCartTargetCenter()
      const id = nextFlightId++

      setFlights((prev) => [
        ...prev,
        {
          id,
          title: payload.title,
          coverImagePath: payload.coverImagePath,
          startX,
          startY,
          dx: target.x - startX,
          dy: target.y - startY,
        },
      ])

      // Trigger cart button bounce right as the book lands
      window.setTimeout(() => {
        const targets = document.querySelectorAll<HTMLElement>('[data-cart-target="true"]')
        targets.forEach((el) => {
          el.classList.remove('sl-cart-bounce')
          void el.offsetWidth
          el.classList.add('sl-cart-bounce')
        })
      }, 960)

      // Clean up after flight finishes
      window.setTimeout(() => {
        setFlights((prev) => prev.filter((item) => item.id !== id))
      }, 1300)
    }

    listeners.add(handleFly)
    return () => {
      listeners.delete(handleFly)
    }
  }, [])

  if (!flights.length) return null

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {flights.map((flight) => (
        <div
          key={flight.id}
          className="sl-fly-to-cart fixed left-0 top-0"
          style={
            {
              left: `${flight.startX - 40}px`,
              top: `${flight.startY - 56}px`,
              '--fly-dx': `${flight.dx}px`,
              '--fly-dy': `${flight.dy}px`,
            } as React.CSSProperties
          }
        >
          <div className="relative rounded-[10px] bg-white p-1 ring-3 ring-[#FFF200] shadow-[0_18px_36px_-6px_rgba(11,94,162,0.65)]">
            <BookCoverThumbnail
              title={flight.title}
              coverImagePath={flight.coverImagePath ?? null}
              className="h-28 w-20 rounded-[6px]"
            />
            <span className="absolute -right-2.5 -top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FFF200] px-1.5 text-[11px] font-extrabold text-[#132a3f] shadow-md ring-2 ring-[#0b5ea2]">
              +1
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
