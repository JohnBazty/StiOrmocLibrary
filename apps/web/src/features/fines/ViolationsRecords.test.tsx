import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ViolationsRecords } from './ViolationsRecords'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const incident = {
  incident_id: 1, full_name: 'Synthetic Student', school_id: 'SYNTHETIC-001', category: 'Noise', incident_at: '2026-01-01T03:00:00Z', action: 'First warning',
  details: 'Synthetic incident only', location: 'Library', recorded_by: 'LIB-1',
  events: [{ type: 'Resolved', reason: 'Synthetic resolution', at: '2026-01-01T03:00:00Z' }, { type: 'Correction', reason: 'Synthetic correction', at: '2026-01-02T03:00:00Z' }],
}
const categories = [
  { categoryId: 1, name: 'Noise', description: null, warningsBeforeFine: 2, fineAmount: 50, isActive: true, sortOrder: 1, used: true },
  { categoryId: 2, name: 'Eating or food', description: null, warningsBeforeFine: 2, fineAmount: 50, isActive: true, sortOrder: 2, used: false },
  { categoryId: 3, name: 'Old rule', description: null, warningsBeforeFine: 2, fineAmount: 50, isActive: false, sortOrder: 3, used: true },
]
const standing = (over: Record<string, unknown> = {}) => ({
  name: 'Synthetic Student', role: 'Student', schoolId: 'SYNTHETIC-001', category: 'Noise', warningsUsed: 0, warningsBeforeFine: 2, fineAmount: 50, amount: null,
  nextStep: 'First warning', fromPaperLog: false, categoryActive: true, earlierWarnings: null, history: [], reviewToken: 'token-1', ...over,
})

type Call = { url: string; options: RequestInit }
/** Answers by address, so a test can change one answer without rewriting the rest. */
function server(routes: Record<string, (call: Call) => unknown> = {}) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    calls.push({ url, options })
    const key = Object.keys(routes).find(route => url.includes(route))
    const data = key ? routes[key]({ url, options }) : url.includes('/violation-categories') ? categories : url.includes('/api/v1/fines/') && url.includes('/standing') ? [] : url.includes('/standing') ? standing() : url.includes('incidentId') ? { items: [incident], total: 1 } : { items: [], total: 0 }
    if (data instanceof Error) return { ok: false, json: async () => ({ success: false, message: data.message, code: (data as Error & { code?: string }).code }) }
    return { ok: true, json: async () => ({ success: true, data }) }
  }))
  return calls
}
const posts = (calls: Call[]) => calls.filter(call => call.options.method === 'POST')

async function openForm() {
  render(<ViolationsRecords admin />)
  fireEvent.click(await screen.findByRole('button', { name: 'Record violation' }))
  await screen.findByRole('form', { name: 'Record a violation' })
}
async function fillAndWait(id = 'SYNTHETIC-001') {
  fireEvent.change(screen.getByLabelText('School ID'), { target: { value: id } })
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Synthetic loud conversation' } })
}

it('a correction preserves a resolved case and its original warning action', async () => {
  server({ '/api/v1/fines/violations?': () => ({ total: 1, items: [incident] }) })
  render(<ViolationsRecords />)
  await screen.findByText('Resolved')
  expect(screen.getByText('First warning')).toBeTruthy()
})

it('shows the steps and the step this record will be once the person and category are known, with no history panel', async () => {
  server({ '/standing': () => standing({ warningsUsed: 1, nextStep: 'Second warning' }) })
  await openForm()
  expect(screen.queryByText(/Warnings already used/)).toBeNull()
  expect(screen.queryByText(/lifetime warning history/)).toBeNull()
  const options = within(screen.getByLabelText('Category')).getAllByRole('option').map(option => option.textContent)
  expect(options).toEqual(['Noise', 'Eating or food'])
  expect((screen.getByRole('button', { name: 'Record violation' }) as HTMLButtonElement).disabled).toBe(true)
  await fillAndWait()
  expect(await screen.findByText('Synthetic Student · Student')).toBeTruthy()
  expect(screen.getByText('This will be the 2nd warning. No charge; borrowing and clearance are not affected.')).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Amount to pay' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Record 2nd warning' })).toBeTruthy()
})

it('saves with the reviewed token, a retry key, the CSRF header and never an amount', async () => {
  const calls = server({ '/standing': () => standing({ warningsUsed: 1, nextStep: 'Second warning' }), '/api/v1/admin/fines/violations?': () => ({ items: [], total: 0 }) })
  await openForm()
  await fillAndWait()
  fireEvent.click(await screen.findByRole('button', { name: 'Record 2nd warning' }))
  await screen.findByText('Violation saved. The person has been notified.')
  const body = JSON.parse(String(posts(calls)[0].options.body))
  expect(body).toMatchObject({ schoolId: 'SYNTHETIC-001', category: 'Noise', fromPaperLog: false, reviewToken: 'token-1' })
  expect(body.requestKey).toMatch(/^[a-f0-9-]{36}$/)
  expect('amount' in body).toBe(false)
  expect('priorWarnings' in body).toBe(false)
  expect(screen.queryByRole('form', { name: 'Record a violation' })).toBeNull()
})

it('at the fine step shows a read-only Amount to pay card and a button that names the fine', async () => {
  server({ '/standing': () => standing({ warningsUsed: 2, nextStep: 'Fine', amount: 50 }) })
  await openForm()
  await fillAndWait()
  const card = await screen.findByRole('group', { name: 'Amount to pay' })
  expect(within(card).getByText('PHP 50.00')).toBeTruthy()
  expect(card.querySelector('input')).toBeNull()
  expect(document.querySelector('input[name="amount"]')).toBeNull()
  expect(screen.queryByRole('textbox', { name: /amount/i })).toBeNull()
  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(screen.getByRole('button', { name: 'Record fine PHP 50.00' })).toBeTruthy()
})

it('"From the paper log" asks for a warning-only standing, then saves it tagged as paper log', async () => {
  const calls = server({ '/standing': ({ url }) => url.includes('paperLog=1') ? standing({ fromPaperLog: true, reviewToken: 'paper-token' }) : standing() })
  await openForm()
  await fillAndWait()
  await screen.findByRole('button', { name: 'Record 1st warning' })
  fireEvent.click(screen.getByLabelText(/From the paper log/))
  fireEvent.click(await screen.findByRole('button', { name: 'Record 1st warning from paper log' }))
  await screen.findByText('Paper-log warning saved. The person was not notified.')
  expect(JSON.parse(String(posts(calls)[0].options.body))).toMatchObject({ fromPaperLog: true, reviewToken: 'paper-token' })
})

it('shows an unknown school ID beside the field and keeps saving disabled', async () => {
  server({ '/standing': () => Object.assign(new Error('No active student or faculty account matches that school ID.'), { code: 'CONDUCT_PERSON' }) })
  await openForm()
  await fillAndWait('NOBODY')
  expect(await screen.findByText('No active student or faculty account matches that school ID.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Record violation' }) as HTMLButtonElement).disabled).toBe(true)
})

it('rejects a future time and a too-short description before saving', async () => {
  server()
  await openForm()
  await fillAndWait()
  await screen.findByRole('button', { name: 'Record 1st warning' })
  fireEvent.change(screen.getByLabelText('When (Philippines)'), { target: { value: '2999-01-01T10:00' } })
  expect(screen.getByText('Choose a time no later than now.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'short' } })
  fireEvent.blur(screen.getByLabelText('What happened?'))
  expect(screen.getByText('Enter at least 10 characters about what happened.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Record 1st warning' }) as HTMLButtonElement).disabled).toBe(true)
})

it('when the rules changed during review it explains and refreshes the steps', async () => {
  let reads = 0
  const stale = Object.assign(new Error('The warning history, fine amount or violation rules changed. Review the current result and save again.'), { code: 'CONDUCT_STALE' })
  const calls = server({
    '/standing': () => (++reads === 1 ? standing() : standing({ warningsUsed: 2, nextStep: 'Fine', amount: 75, reviewToken: 'token-2' })),
    '/api/v1/admin/fines/violations?': () => ({ items: [], total: 0 }),
    '/api/v1/admin/fines/violations': ({ options }) => (options.method === 'POST' ? stale : { items: [], total: 0 }),
  })
  await openForm()
  await fillAndWait()
  fireEvent.click(await screen.findByRole('button', { name: 'Record 1st warning' }))
  expect(await screen.findByText(/rules changed/)).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Record fine PHP 75.00' })).toBeTruthy()
  expect(posts(calls).length).toBe(1)
})

it('opens a record in a side drawer with its review notes and saves a new note', async () => {
  const calls = server({ '/api/v1/admin/fines/violations?': () => ({ items: [incident], total: 1 }) })
  render(<ViolationsRecords admin />)
  fireEvent.click(await screen.findByRole('button', { name: /Noise record/ }))
  const drawer = await screen.findByRole('dialog', { name: /Synthetic Student/ })
  expect(within(drawer).getByText('Synthetic incident only')).toBeTruthy()
  expect(within(drawer).getByText(/Correction .*Synthetic correction/)).toBeTruthy()
  fireEvent.change(within(drawer).getByLabelText('Reason'), { target: { value: 'Synthetic review of this note' } })
  fireEvent.click(within(drawer).getByRole('button', { name: 'Save review note' }))
  await screen.findByText('Review note saved; original history is preserved.')
  expect(JSON.parse(String(posts(calls)[0].options.body))).toEqual({ type: 'Correction', reason: 'Synthetic review of this note' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('closes the drawer with Escape and tells the page', async () => {
  server({ '/api/v1/admin/fines/violations?': () => ({ items: [incident], total: 1 }) })
  const onIncidentChange = vi.fn()
  render(<ViolationsRecords admin incidentId={null} onIncidentChange={onIncidentChange} />)
  fireEvent.click(await screen.findByRole('button', { name: /Noise record/ }))
  expect(onIncidentChange).toHaveBeenCalledWith(1)
})

it('opens the record named in the page address even when it is not in the current list', async () => {
  const calls = server({ '/api/v1/admin/fines/violations?': ({ url }) => (url.includes('incidentId=9') ? { items: [{ ...incident, incident_id: 9 }], total: 1 } : { items: [], total: 0 }) })
  const onIncidentChange = vi.fn()
  render(<ViolationsRecords admin incidentId={9} onIncidentChange={onIncidentChange} />)
  const drawer = await screen.findByRole('dialog', { name: /Synthetic Student/ })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onIncidentChange).toHaveBeenCalledWith(null)
  expect(calls.some(call => call.url.includes('incidentId=9'))).toBe(true)
  expect(drawer).toBeTruthy()
})

it('shows a person their own warnings left per category without management actions, and retries a failed read', async () => {
  let listReads = 0
  const fetch = vi.fn(async (url: string) => {
    if (!url.includes('/standing') && ++listReads === 1) throw new Error('Please retry')
    return { ok: true, json: async () => ({ success: true, data: url.includes('/standing') ? [{ category: 'Noise', warningsUsed: 1, warningsBeforeFine: 2, warningsLeft: 1, fineAmount: 50 }] : { items: [], total: 0 } }) }
  })
  vi.stubGlobal('fetch', fetch)
  render(<ViolationsRecords />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: 'Record violation' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(await screen.findByText('1 of 2 warnings left')).toBeTruthy()
  expect(fetch.mock.calls.some(call => String(call[0]).includes('/api/v1/fines/violations'))).toBe(true)
})
