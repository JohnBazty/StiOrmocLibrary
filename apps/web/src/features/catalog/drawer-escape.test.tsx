import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookDetailDrawer } from './BookDetailDrawer'
import { BookOverview } from './BookOverview'
import { ResearchOverview } from './ResearchOverview'

const { pending } = vi.hoisted(() => ({ pending: () => new Promise<never>(() => {}) }))
vi.mock('./book-catalog-api', () => ({ fetchBookOverview: vi.fn(pending), fetchCatalogCopyAsset: vi.fn(pending) }))
vi.mock('./research-catalog-api', () => ({ fetchResearchOverview: vi.fn(pending) }))

afterEach(() => cleanup())

const drawers = {
  'Book and barcode drawer': (onClose: () => void) => <BookDetailDrawer titleId={1} barcode="BOOK-1" onClose={onClose} />,
  'book overview drawer': (onClose: () => void) => <BookOverview titleId={1} role="Student" activeBookCount={0} bookLimit={2} selectedBookCount={0} alreadySelected={false} onAddToCart={() => {}} onClose={onClose} />,
  'research overview drawer': (onClose: () => void) => <ResearchOverview researchId={1} onClose={onClose} />,
}

describe('catalog drawers close with the Escape key', () => {
  for (const [name, drawer] of Object.entries(drawers)) {
    it(`closes the ${name} on Escape`, () => {
      const onClose = vi.fn()
      render(drawer(onClose))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it(`leaves the ${name} open for other keys and for an Escape an inner dialog already handled`, () => {
      const onClose = vi.fn()
      render(drawer(onClose))
      fireEvent.keyDown(document, { key: 'Enter' })
      const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      handled.preventDefault()
      document.dispatchEvent(handled)
      expect(onClose).not.toHaveBeenCalled()
    })
  }
})
