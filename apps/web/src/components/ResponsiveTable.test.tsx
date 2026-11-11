import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResponsiveTable } from './ResponsiveTable'

describe('ResponsiveTable', () => {
  it('keeps table semantics, readable column labels, and working actions', () => {
    const open = vi.fn()
    const { container } = render(<ResponsiveTable label="Print jobs"><table><thead><tr><th><button>Document <span aria-hidden="true">↓</span></button></th><th>Actions</th></tr></thead><tbody>{[1, 2].map(id => <tr key={id}><td>Document {id}</td><td><button onClick={() => open(id)}>View payment {id}</button></td></tr>)}</tbody></table></ResponsiveTable>)
    expect(screen.getByRole('region', { name: 'Print jobs' })).toBeTruthy()
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(container.querySelector('td')?.getAttribute('data-label')).toBe('Document')
    expect(container.querySelectorAll('td[data-label="Actions"]')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'View payment 2' }))
    expect(open).toHaveBeenCalledWith(2)
  })

  it('keeps spanning empty states and updates filtered records without nested wrappers', () => {
    const table = (empty: boolean) => <ResponsiveTable><table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody>{empty ? <tr><td colSpan={2}>No records</td></tr> : <tr><td>Alex</td><td>Active</td></tr>}</tbody></table></ResponsiveTable>
    const { container, rerender } = render(table(true))
    expect(container.querySelector('td')?.hasAttribute('data-label')).toBe(false)
    expect(container.querySelector('td')?.getAttribute('colspan')).toBe('2')
    rerender(table(false))
    rerender(table(false))
    expect(container.querySelectorAll('.responsive-cell-value')).toHaveLength(2)
    expect(container.querySelector('.responsive-cell-value .responsive-cell-value')).toBeNull()
    expect(container.querySelector('td[data-label="Name"]')?.textContent).toBe('Alex')
  })
})
