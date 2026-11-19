export const ENTRANCE_CHECK_IN = 'Check in at the library entrance before borrowing.'
export const BORROWING_CLOSED = 'The library is not accepting borrowing at this time.'

export function borrowingClosedMessage(libraryState?: string | null) {
  switch (libraryState) {
    case 'Closed':
      return 'The library is closed. Checkout can continue when it opens.'
    case 'Closing':
      return 'The library is in its closing period. New checkouts stop before the doors close.'
    case 'Needs configuration':
      return 'Library hours are not set up, so borrowing is turned off.'
    case 'Scheduled event':
      return 'A scheduled event has borrowing turned off until it ends.'
    default:
      return 'Borrowing is turned off right now. Checkout can continue when the library is open for borrowing.'
  }
}

/** Staff-facing lines for the counter. A closed library is the reason checkout waits; check-in is the next step, not a second unexplained error. */
export function checkoutBlockerLines(blockers: string[], libraryState?: string | null) {
  const closed = blockers.includes(BORROWING_CLOSED)
  const needsCheckIn = blockers.includes(ENTRANCE_CHECK_IN)
  const lines = blockers.filter(blocker => blocker !== BORROWING_CLOSED && blocker !== ENTRANCE_CHECK_IN)
  if (closed) lines.unshift(borrowingClosedMessage(libraryState))
  if (needsCheckIn) {
    lines.push(closed
      ? 'This borrower has no check-in for today. Record it once borrowing is open, then confirm the handover.'
      : 'This borrower has not checked in today. Check them in before handing over the book.')
  }
  return lines
}
