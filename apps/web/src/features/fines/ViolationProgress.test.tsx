import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { recordButtonLabel, standingMessage, ViolationProgress } from './ViolationProgress'
import type { Standing } from './violations-api'

afterEach(cleanup)

const base: Standing = {
  name: 'Synthetic Student', role: 'Student', schoolId: 'S-1', category: 'Noise', warningsUsed: 0, warningsBeforeFine: 2, fineAmount: 50, amount: null,
  nextStep: 'First warning', fromPaperLog: false, categoryActive: true, paperLogAllowed: true, paperLogReason: null, earlierWarnings: null, history: [], reviewToken: 't',
}

function steps() {
  return within(screen.getByRole('list', { name: 'Steps toward a fine' })).getAllByRole('listitem').map(item => item.textContent)
}

it('marks done, current and later steps with text as well as symbols', () => {
  render(<ViolationProgress standing={{ ...base, warningsUsed: 1, nextStep: 'Second warning' }} />)
  expect(steps()).toEqual(['1st warningDone', '2nd warningThis record', 'FineLater'])
  expect(screen.getByText('2nd warning').closest('li')?.getAttribute('aria-current')).toBe('step')
})

it('reaches the fine at the third offense and shows the whole path as done', () => {
  render(<ViolationProgress standing={{ ...base, warningsUsed: 2, nextStep: 'Fine', amount: 50 }} />)
  expect(steps()).toEqual(['1st warningDone', '2nd warningDone', 'FineThis record'])
})

it('derives the highlighted step from what the server will save, not from the warning count', () => {
  // warningsUsed is deliberately inconsistent: only nextStep decides.
  render(<ViolationProgress standing={{ ...base, warningsUsed: 5, nextStep: 'First warning', fromPaperLog: true }} />)
  expect(steps()).toEqual(['1st warningThis record', '2nd warningLater', 'FineLater'])
})

it('handles a category with no warnings (threshold 0) and one with three warnings', () => {
  const { unmount } = render(<ViolationProgress standing={{ ...base, warningsBeforeFine: 0, nextStep: 'Fine', amount: 50 }} />)
  expect(steps()).toEqual(['FineThis record'])
  expect(recordButtonLabel({ ...base, warningsBeforeFine: 0, nextStep: 'Fine', amount: 50 })).toBe('Record fine PHP 50.00')
  unmount()
  expect(recordButtonLabel({ ...base, warningsBeforeFine: 3, nextStep: 'First warning' })).toBe('Record 1st warning')
  expect(recordButtonLabel({ ...base, warningsBeforeFine: 3, nextStep: 'Second warning' })).toBe('Record 2nd warning')
  expect(recordButtonLabel({ ...base, warningsBeforeFine: 3, nextStep: 'Final warning', fromPaperLog: true })).toBe('Record 3rd warning from paper log')
  render(<ViolationProgress standing={{ ...base, warningsBeforeFine: 3, nextStep: 'Final warning' }} />)
  expect(steps()).toEqual(['1st warningDone', '2nd warningDone', '3rd warningThis record', 'FineLater'])
})

it('follows the threshold from setup, and faculty see only the fine', () => {
  const { unmount } = render(<ViolationProgress standing={{ ...base, warningsBeforeFine: 3, warningsUsed: 2, nextStep: 'Final warning' }} />)
  expect(steps()).toEqual(['1st warningDone', '2nd warningDone', '3rd warningThis record', 'FineLater'])
  unmount()
  render(<ViolationProgress standing={{ ...base, role: 'Faculty', warningsBeforeFine: 0, nextStep: 'Fine', amount: 50 }} />)
  expect(steps()).toEqual(['FineThis record'])
})

it('says in plain words what the record will do', () => {
  expect(standingMessage(base)).toBe('No earlier records in this category. This will be the 1st warning. No charge; borrowing and clearance are not affected.')
  expect(standingMessage({ ...base, warningsUsed: 1, nextStep: 'Second warning' })).toBe('This will be the 2nd warning. No charge; borrowing and clearance are not affected.')
  expect(standingMessage({ ...base, warningsUsed: 2, nextStep: 'Fine', amount: 50 })).toBe('Both warnings are used. This record is a fine.')
  expect(standingMessage({ ...base, role: 'Faculty', warningsBeforeFine: 0, nextStep: 'Fine', amount: 50 })).toBe('Faculty go straight to the fine.')
  expect(standingMessage({ ...base, warningsBeforeFine: 0, nextStep: 'Fine', amount: 50 })).toBe('This category has no warnings. This record is a fine.')
  expect(standingMessage({ ...base, fromPaperLog: true })).toBe('Copying an earlier warning from the paper log. No charge and no message to the person.')
})

it('names the outcome on the save button', () => {
  expect(recordButtonLabel(base)).toBe('Record 1st warning')
  expect(recordButtonLabel({ ...base, nextStep: 'Second warning' })).toBe('Record 2nd warning')
  expect(recordButtonLabel({ ...base, warningsBeforeFine: 3, warningsUsed: 2, nextStep: 'Final warning' })).toBe('Record 3rd warning')
  expect(recordButtonLabel({ ...base, nextStep: 'Fine', amount: 50 })).toBe('Record fine PHP 50.00')
  expect(recordButtonLabel({ ...base, fromPaperLog: true })).toBe('Record 1st warning from paper log')
})

it('lists earlier history with a Paper log tag and reviewed warnings', () => {
  render(<ViolationProgress standing={{
    ...base, warningsUsed: 3, earlierWarnings: { count: 1, reviewedAt: '2026-01-02T00:00:00Z' },
    history: [{ incidentId: 1, date: '2026-02-01T03:00:00Z', step: 'First warning', source: 'Paper log' }, { incidentId: 2, date: '2026-03-01T03:00:00Z', step: 'Second warning', source: 'Recorded' }],
  }} />)
  expect(screen.getByText(/1 earlier warning \(reviewed/)).toBeTruthy()
  expect(screen.getByText('Paper log')).toBeTruthy()
  expect(screen.getAllByRole('listitem', { name: /warning on/ }).length).toBe(2)
})
