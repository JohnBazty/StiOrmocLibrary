import { cleanup, render, screen } from '@testing-library/react'
import { lazy, Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from './RouteErrorBoundary'

describe('RouteErrorBoundary', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('shows a reload message instead of a blank page when a page chunk fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Broken = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    render(<RouteErrorBoundary><Suspense fallback={<p>Loading</p>}><Broken /></Suspense></RouteErrorBoundary>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })

  it('clears the error when the user navigates to another page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Broken = lazy(() => Promise.reject(new Error('offline')))
    const view = render(<RouteErrorBoundary resetKey="/catalog"><Suspense fallback={null}><Broken /></Suspense></RouteErrorBoundary>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    view.rerender(<RouteErrorBoundary resetKey="/loans"><p>Loans</p></RouteErrorBoundary>)
    expect(screen.getByText('Loans')).toBeTruthy()
  })

  it('renders children when nothing fails', () => {
    render(<RouteErrorBoundary><p>Catalog</p></RouteErrorBoundary>)
    expect(screen.getByText('Catalog')).toBeTruthy()
  })
})
