import { useRef, useState } from 'react'
import { reserveBookTitle } from './book-catalog-api'

/** Each title owns its request key, pending state, and feedback in card/details views. */
export function useBookReservations(onCommitted: () => void) {
  const locks = useRef(new Set<number>())
  const keys = useRef(new Map<number, string>())
  const [pending, setPending] = useState(new Set<number>())
  const [reserved, setReserved] = useState(new Set<number>())
  const [errors, setErrors] = useState(new Map<number, string>())
  async function reserve(book: { titleId: number; title: string }) {
    if (locks.current.has(book.titleId) || reserved.has(book.titleId)) return
    locks.current.add(book.titleId)
    setPending(new Set(locks.current))
    setErrors(old => { const next = new Map(old); next.delete(book.titleId); return next })
    const requestId = keys.current.get(book.titleId) ?? crypto.randomUUID()
    keys.current.set(book.titleId, requestId)
    try {
      await reserveBookTitle(book.titleId, requestId)
      setReserved(old => new Set(old).add(book.titleId))
      onCommitted()
    } catch (cause) {
      setErrors(old => new Map(old).set(book.titleId, cause instanceof Error ? cause.message : 'This book could not be reserved. Try again.'))
    } finally {
      locks.current.delete(book.titleId)
      setPending(new Set(locks.current))
    }
  }
  return { pending, reserved, errors, reserve }
}
