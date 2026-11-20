import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BrandLogo, BRAND_LOGO_SRC } from './BrandLogo'

afterEach(cleanup)

it('shows the one system logo file as a decorative mark beside the written name', () => {
  const { container } = render(<BrandLogo className="h-10 w-10" />)
  const img = container.querySelector('img')!
  expect(img.getAttribute('src')).toBe(BRAND_LOGO_SRC)
  expect(img.getAttribute('alt')).toBe('')
  expect(img.className).toContain('h-10')
})
