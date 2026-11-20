import { describe, expect, it } from 'vitest'
import { agendaBrief, eventDetails } from './agenda-text'

describe('agenda text', () => {
  it('keeps the first sentence of a long body and trims it to a short line', () => {
    expect(agendaBrief('The library closes early today. Please return books by 3 PM and collect holds before then.')).toBe('The library closes early today.')
    const long = agendaBrief('A'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(90)
    expect(long.endsWith('…')).toBe(true)
    expect(agendaBrief('  Short   note  ')).toBe('Short note')
  })
  it('describes an event with kind, place, seats and what is paused', () => {
    expect(eventDetails({ event_kind: 'Class', space_name: 'Reading area', seat_capacity: 30, allow_walk_ins: false, allow_borrowing: true, allow_printing: false }))
      .toBe('Class · Reading area · 30 seats left · No walk-ins · Printing paused')
  })
})
