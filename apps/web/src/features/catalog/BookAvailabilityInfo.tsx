type Stock = { available: number; total: number; borrowed?: number; reserved?: number }

export function bookAvailabilityMessage({ available, total, borrowed = 0, reserved = 0 }: Stock) {
  if (available > 0) return null
  if (total <= 0) return 'No physical copies are recorded.'
  if (borrowed === total) return 'All copies are currently borrowed.'
  if (reserved === total) return 'All copies are currently reserved.'
  if (borrowed > 0) return 'No copies available. Some copies are still borrowed.'
  return 'No copies are currently available.'
}

export function BookAvailabilityInfo(props: Stock) {
  const message = bookAvailabilityMessage(props)
  return message ? <p className="mt-2 text-pretty text-xs leading-5 text-[#0b5ea2]/80 dark:text-white/80">{message}</p> : null
}
