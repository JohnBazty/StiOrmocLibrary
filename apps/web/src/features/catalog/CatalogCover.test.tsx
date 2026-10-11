import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CatalogCover } from './CatalogCover'

afterEach(cleanup)

it('shows a placeholder for missing or unreadable covers and recovers for a different cover', () => {
  const { rerender } = render(<CatalogCover title="1984" />)
  expect(screen.getByText('Cover not available')).toBeTruthy()
  rerender(<CatalogCover title="1984" src="/covers/1984.jpg" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('Cover not available')).toBeTruthy()
  rerender(<CatalogCover title="1984" src="/covers/replacement.jpg" />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/covers/replacement.jpg')
})
