import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CatalogCover } from './CatalogCover'
import { BookCoverThumbnail } from './BookCoverThumbnail'

afterEach(cleanup)

it.each(['catalog', 'thumbnail'])('%s shows title initials for missing or unreadable covers and recovers for a different cover', kind => {
  const cover = (title: string, src?: string) => kind === 'catalog' ? <CatalogCover title={title} src={src} /> : <BookCoverThumbnail title={title} coverImagePath={src} />
  const { rerender } = render(cover('Harry Potter'))
  expect(screen.getByRole('img', { name: 'Harry Potter — title initials cover' }).textContent).toBe('HP')
  for (const [title, initials] of [['1984', '1984'], ['Dune', 'DU'], ['  École   Française  ', 'ÉF'], ['!!!', 'BK']]) {
    rerender(cover(title))
    expect(screen.getByRole('img').textContent).toBe(initials)
  }
  rerender(cover('1984', '/covers/1984.jpg'))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img', { name: '1984 — title initials cover' }).textContent).toBe('1984')
  expect(screen.queryByAltText('1984 book cover')).toBeNull()
  rerender(cover('1984', '/covers/replacement.jpg'))
  expect(screen.getByRole('img').getAttribute('src')).toBe('/covers/replacement.jpg')
})
