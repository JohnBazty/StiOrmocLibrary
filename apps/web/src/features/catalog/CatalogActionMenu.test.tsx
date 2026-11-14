import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogActionMenu } from './CatalogActionMenu'

afterEach(cleanup)

it('opens all existing book actions and invokes the selected handler', () => {
  const category = vi.fn(), quotation = vi.fn(), archive = vi.fn()
  render(<CatalogActionMenu title="Example book" onCategory={category} onQuotation={quotation} onArchive={archive} />)
  const trigger = screen.getByRole('button', { name: 'More actions for Example book' })
  expect(screen.queryByRole('menu')).toBeNull()
  for (const [label, callback] of [['Change category', category], ['Supplier quotations', quotation], ['Archive book', archive]] as const) {
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  }
})

it('retains research category action, keyboard movement and Escape focus restoration', () => {
  render(<CatalogActionMenu title="Example research" onCategory={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: 'More actions for Example research' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Change category' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('moves between book menu items and dismisses on outside pointer and scroll', () => {
  render(<CatalogActionMenu title="Example book" onCategory={vi.fn()} onQuotation={vi.fn()} onArchive={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: 'More actions for Example book' })
  fireEvent.click(trigger)
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Supplier quotations' }))
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Archive book' }))
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.scroll(window)
  expect(screen.queryByRole('menu')).toBeNull()
})
