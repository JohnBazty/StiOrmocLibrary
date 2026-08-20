import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDesktopScanner } from './useDesktopScanner'

function Harness({ onScan }: { onScan: (value: string) => void }) {
  useDesktopScanner(onScan)
  return <div><input aria-label="Normal input" /><div data-testid="surface" tabIndex={0} /></div>
}

afterEach(cleanup)

describe('useDesktopScanner', () => {
  it('submits rapid keyboard-wedge text terminated by Enter', () => {
    const onScan = vi.fn()
    const { getByTestId } = render(<Harness onScan={onScan} />)
    const surface = getByTestId('surface')
    for (const key of 'BC00042') fireEvent.keyDown(surface, { key })
    fireEvent.keyDown(surface, { key: 'Enter' })
    expect(onScan).toHaveBeenCalledWith('BC00042')
  })

  it('does not capture ordinary typing inside form fields', () => {
    const onScan = vi.fn()
    const { getByLabelText } = render(<Harness onScan={onScan} />)
    const input = getByLabelText('Normal input')
    for (const key of 'BC00042') fireEvent.keyDown(input, { key })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onScan).not.toHaveBeenCalled()
  })
})
