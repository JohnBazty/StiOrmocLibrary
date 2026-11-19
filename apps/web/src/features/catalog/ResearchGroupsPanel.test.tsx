import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchGroupsPanel } from './ResearchGroupsPanel'
const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), assignment: vi.fn(), assign: vi.fn() }))
vi.mock('./research-groups-api', () => ({ researchGroupsApi: api }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: { search: vi.fn().mockResolvedValue({ items: [] }) } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('adds an SHS research group with an explicit grade instead of a book category', async () => {
  api.list.mockResolvedValue([]); api.save.mockResolvedValue({ id: 1 })
  render(<ResearchGroupsPanel />)
  fireEvent.change(screen.getByLabelText('Department'),{ target: { value: 'SHS' } })
  fireEvent.change(screen.getByLabelText('Strand'),{ target: { value: 'STEM' } })
  fireEvent.change(screen.getByLabelText('Year / grade level'),{ target: { value: '12' } })
  fireEvent.click(screen.getByRole('button',{ name: 'Add group' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ department: 'SHS', program: 'STEM', yearLevel: 12, active: true })))
  expect(await screen.findByText('Research group saved.')).toBeTruthy()
})
it('keeps an edited group draft after a server version conflict', async () => {
  api.list.mockResolvedValue([{ id: 1, department: 'College', program: 'BSIT', yearLevel: 2, active: true, version: 3, label: 'BSIT · Year 2', uses: 1 }])
  api.save.mockRejectedValue(new Error('This group changed. Reload it before saving.'))
  render(<ResearchGroupsPanel />)
  fireEvent.click(await screen.findByRole('button',{ name: 'Edit BSIT · Year 2' }))
  fireEvent.change(screen.getByLabelText('Status'),{ target: { value: 'archived' } })
  fireEvent.click(screen.getByRole('button',{ name: 'Save group' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','This group changed. Reload it before saving.')
  expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('archived')
})
