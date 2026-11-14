import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { UnsavedGuard, useUnsavedGuard } from './UnsavedChanges'

function CloseButton({ onClose }: { onClose: () => void }) {
  const { request } = useUnsavedGuard()
  return <button type="button" onClick={() => request(onClose)}>Close form</button>
}

function Form({ onSubmit = vi.fn(), onSave, onClose = vi.fn() }: { onSubmit?: () => void; onSave?: () => Promise<boolean>; onClose?: () => void }) {
  return <>
    <a href="/librarian/dashboard" onClick={(event) => event.preventDefault()}>Dashboard</a>
    <UnsavedGuard onSave={onSave}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <label>Message<input /></label>
        <label data-unsaved-ignore>Search<input /></label>
        <button type="submit">Publish</button>
      </form>
      <CloseButton onClose={onClose} />
    </UnsavedGuard>
  </>
}

afterEach(() => cleanup())

describe('UnsavedGuard', () => {
  it('lets everything through while nothing was typed, or only an ignored field was', () => {
    const onClose = vi.fn()
    render(<Form onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks before a link or a close once something is typed; Keep editing stays, Discard leaves', () => {
    const onClose = vi.fn()
    render(<Form onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.getByRole('alertdialog', { name: 'You have unsaved changes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Save changes without a save function presses the form save button and stays', () => {
    const onSubmit = vi.fn(), onClose = vi.fn()
    render(<Form onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Save changes with a save function continues only when the save worked', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<Form onSave={onSave} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('a forced change also guards, and Escape keeps editing', () => {
    render(<UnsavedGuard dirty><a href="/x" onClick={(event) => event.preventDefault()}>Leave</a></UnsavedGuard>)
    fireEvent.click(screen.getByText('Leave'))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

function Sending({ outcome }: { outcome: 'status' | 'alert' }) {
  const [shown, setShown] = useState(false)
  return <><a href="/x" onClick={(event) => event.preventDefault()}>Leave</a>{shown ? <p role={outcome}>{outcome}</p> : null}<UnsavedGuard cleanOnSubmit><form onSubmit={(event) => { event.preventDefault(); setShown(true) }}><label>Note<input /></label><button type="submit">Send</button></form></UnsavedGuard></>
}

it('a saved form stops asking; a refused one keeps asking', async () => {
  render(<Sending outcome="status" />)
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByText('status')
  await new Promise((resolve) => setTimeout(resolve, 400))
  fireEvent.click(screen.getByText('Leave'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  cleanup()
  render(<Sending outcome="alert" />)
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await new Promise((resolve) => setTimeout(resolve, 400))
  fireEvent.click(screen.getByText('Leave'))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})

it('file links and same-page anchors never ask', () => {
  render(<UnsavedGuard dirty><a href="/api/public/catalog/files/1" onClick={(event) => event.preventDefault()}>PDF</a><a href="#top" onClick={(event) => event.preventDefault()}>Top</a></UnsavedGuard>)
  fireEvent.click(screen.getByText('PDF'))
  fireEvent.click(screen.getByText('Top'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('saving one form stays when another form still has changes', async () => {
  const onClose = vi.fn()
  render(<><UnsavedGuard dirty><p>Other form</p></UnsavedGuard><UnsavedGuard dirty onSave={async () => true}><CloseButton onClose={onClose} /></UnsavedGuard></>)
  fireEvent.click(screen.getByRole('button', { name: 'Close form' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(onClose).not.toHaveBeenCalled()
})
