import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchFlow } from './SearchFlow'
import { PublicCatalogPage } from '../catalog/PublicCatalogPage'

vi.mock('../catalog/PublicCatalogPage', () => ({
  PublicCatalogPage: vi.fn(() => <div>catalog results</div>),
}))

afterEach(() => { vi.clearAllMocks(); cleanup() })

it('renders the public catalog in embedded mode, no identity required', () => {
  render(<SearchFlow lang="en" onDone={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Search the catalog' })).toBeTruthy()
  expect(screen.getByText('catalog results')).toBeTruthy()
  expect(vi.mocked(PublicCatalogPage).mock.calls[0][0]).toMatchObject({ embedded: true })
})
