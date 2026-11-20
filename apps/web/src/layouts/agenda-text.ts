const MAX = 90

/** First sentence of a body, whitespace collapsed and kept to one short line for the sidebar agenda. */
export function agendaBrief(text: string | null | undefined, max = MAX) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  const sentence = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`
}

type EventFacts = { event_kind: string; space_name: string; seat_capacity: number; allow_walk_ins: boolean; allow_borrowing: boolean; allow_printing: boolean }

/** Kind, place, seats and anything paused, e.g. "Class · Reading area · 30 seats left · Printing paused". */
export function eventDetails(event: EventFacts) {
  return [
    event.event_kind,
    event.space_name,
    `${event.seat_capacity} seats left`,
    event.allow_walk_ins ? null : 'No walk-ins',
    event.allow_borrowing ? null : 'Borrowing paused',
    event.allow_printing ? null : 'Printing paused',
  ].filter(Boolean).join(' · ')
}
