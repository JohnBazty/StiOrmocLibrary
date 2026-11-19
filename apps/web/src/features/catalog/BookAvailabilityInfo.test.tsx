import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BookAvailabilityInfo, bookAvailabilityMessage } from './BookAvailabilityInfo'
afterEach(cleanup)
it('distinguishes borrowed, reserved, missing and mixed unavailable copies', () => {
 expect(bookAvailabilityMessage({available:0,total:2,borrowed:2})).toBe('All copies are currently borrowed.')
 expect(bookAvailabilityMessage({available:0,total:2,reserved:2})).toBe('All copies are currently reserved.')
 expect(bookAvailabilityMessage({available:0,total:0})).toBe('No physical copies are recorded.')
 expect(bookAvailabilityMessage({available:0,total:3,borrowed:1})).toBe('No copies available. Some copies are still borrowed.')
 expect(bookAvailabilityMessage({available:0,total:3})).toBe('No copies are currently available.')
 expect(bookAvailabilityMessage({available:1,total:2,borrowed:1})).toBeNull()
})
it('keeps the notice compact and removes it when a copy becomes available', () => {
 const view=render(<BookAvailabilityInfo available={0} total={1} borrowed={1}/>)
 expect(screen.getByText('All copies are currently borrowed.')).toBeTruthy()
 view.rerender(<BookAvailabilityInfo available={1} total={1} borrowed={0}/>)
 expect(screen.queryByText('All copies are currently borrowed.')).toBeNull()
})
