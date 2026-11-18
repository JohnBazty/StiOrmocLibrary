import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LateEnrollment } from './LateEnrollment'
import { enrollmentApi, type Semester } from './enrollment-api'

vi.mock('./enrollment-api', () => ({enrollmentApi: {lateReview: vi.fn(), lateSave: vi.fn()}}))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const term = {semester_id: 1, academic_year: '2026-2027', term_name: '1st Semester', end_date: '2026-12-18'} as Semester
const preview = {added: 1, alreadyListed: 0, missingEmail: 0, reviewToken: 'reviewed',
  studentCount: 1, errorCount: 0, warningCount: 0,
  sheets: [{name: 'Students', headings: ['Student ID'], rows: [{row: 1, cells: ['TEST-1'], errors: [], warnings: []}]}]}

it('requires registrar confirmation after review and refreshes after a successful manual addition', async () => {
  vi.mocked(enrollmentApi.lateReview).mockResolvedValue(preview)
  vi.mocked(enrollmentApi.lateSave).mockResolvedValue({added: 1, alreadyListed: 0, missingEmail: 0, missingEmailStudentIds: []})
  const saved = vi.fn()
  render(<LateEnrollment term={term} onSaved={saved} onClose={vi.fn()}/>)
  for (const [label, value] of [['Student ID', 'TEST-1'], ['First name', 'Test'], ['Last name', 'Student'],
    ['Program or strand', 'BSIT'], ['Year or grade level', '1st Year'], ['Registrar confirmation date', '2026-11-18']]) {
    fireEvent.change(screen.getByLabelText(label), {target: {value}})
  }
  fireEvent.submit(screen.getByRole('button', {name: 'Review additions'}).closest('form')!)
  const save = await screen.findByRole('button', {name: 'Add to semester roster'})
  expect((save as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', {name: /I confirm the registrar/}))
  fireEvent.click(save)
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(enrollmentApi.lateSave).toHaveBeenCalledWith(1, expect.objectContaining({schoolId: 'TEST-1', confirmed: true, reviewToken: 'reviewed'}))
  expect(await screen.findByText('1 students added. 0 already on this semester roster.')).toBeTruthy()
})

it('keeps the selected file after a review failure and invalidates review after date edits', async () => {
  vi.mocked(enrollmentApi.lateReview).mockRejectedValueOnce(new Error('Please retry.')).mockResolvedValue(preview)
  render(<LateEnrollment term={term} onSaved={vi.fn()} onClose={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('Entry method'), {target: {value: 'file'}})
  fireEvent.change(screen.getByLabelText('Registrar confirmation date'), {target: {value: '2026-11-18'}})
  const file = new File(['test'], 'late.csv')
  fireEvent.change(screen.getByLabelText('Late student list'), {target: {files: [file]}})
  fireEvent.submit(screen.getByRole('button', {name: 'Review additions'}).closest('form')!)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Please retry.')
  expect((screen.getByLabelText('Late student list') as HTMLInputElement).files?.[0]).toBe(file)
  fireEvent.submit(screen.getByRole('button', {name: 'Review additions'}).closest('form')!)
  await screen.findByRole('button', {name: 'Add to semester roster'})
  const body = vi.mocked(enrollmentApi.lateReview).mock.calls[1][1] as FormData
  expect(body.get('roster')).toBe(file)
  fireEvent.change(screen.getByLabelText('Registrar confirmation date'), {target: {value: '2026-11-17'}})
  expect(screen.queryByRole('button', {name: 'Add to semester roster'})).toBeNull()
})

