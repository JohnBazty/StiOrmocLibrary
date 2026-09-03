import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InventoryApiError } from './inventory-api'
import { InventoryRemovalDialog } from './InventoryRemovalDialog'

const target = {
  kind: 'book' as const,
  id: 7,
  item_title: 'Clean Code',
  accession_number: 'ACC-007',
  barcode: 'BOOK-007',
}

describe('InventoryRemovalDialog', () => {
  it('requires an exact accession confirmation before permanent deletion', async () => {
    const deleteItem = vi.fn().mockResolvedValue({ deleted: true })
    const completed = vi.fn().mockResolvedValue(undefined)
    render(<InventoryRemovalDialog
      target={target}
      deleteItem={deleteItem}
      archiveItem={vi.fn()}
      onCancel={vi.fn()}
      onCompleted={completed}
    />)

    const submit = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ACC-007' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    await waitFor(() => expect(deleteItem).toHaveBeenCalledTimes(1))
    expect(completed).toHaveBeenCalledWith('deleted')
  })

  it('switches to archive fallback when the server preserves historical data', async () => {
    const deleteItem = vi.fn().mockRejectedValue(new InventoryApiError(
      'This copy has history and must be archived.', 'PHYSICAL_COPY_REQUIRES_ARCHIVE', {}, { canArchive: true },
    ))
    const archiveItem = vi.fn().mockResolvedValue({ lifecycleStatus: 'Archived' })
    const completed = vi.fn().mockResolvedValue(undefined)
    render(<InventoryRemovalDialog
      target={target}
      deleteItem={deleteItem}
      archiveItem={archiveItem}
      onCancel={vi.fn()}
      onCompleted={completed}
    />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ACC-007' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByRole('heading', { name: 'Archive book copy?' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retain completed circulation history' } })
    fireEvent.click(screen.getByRole('button', { name: 'Archive copy' }))

    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith('Retain completed circulation history'))
    expect(completed).toHaveBeenCalledWith('archived')
  })
})

afterEach(cleanup)
