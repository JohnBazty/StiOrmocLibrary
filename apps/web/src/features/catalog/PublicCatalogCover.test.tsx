import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PublicCatalogCover } from './PublicCatalogCover'

afterEach(cleanup)
it('keeps uploaded artwork and falls back to the full title and author after an image failure', () => {
  const { rerender } = render(<PublicCatalogCover title="Computer Networks" author="Example Author" src="/cover.jpg" />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/cover.jpg')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img', { name: 'Computer Networks cover' }).textContent).toContain('Computer Networks')
  expect(screen.getByText('Example Author')).toBeTruthy()
  rerender(<PublicCatalogCover title="Computer Networks" author="Example Author" src="/replacement.jpg" />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/replacement.jpg')
})
