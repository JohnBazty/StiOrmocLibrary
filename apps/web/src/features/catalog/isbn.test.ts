import { describe, expect, it } from 'vitest'
import { isbnInputError, normalizeIsbnInput } from './isbn'

describe('ISBN entry validation', () => {
  it('accepts normalized ISBN-13 and ISBN-10 values', () => {
    expect(isbnInputError('978-0-13-235088-4')).toBeNull()
    expect(isbnInputError('0-13-235088-2')).toBeNull()
    expect(isbnInputError('0-8044-2957-X')).toBeNull()
  })

  it('supports pasted labels and Unicode hyphens', () => {
    expect(normalizeIsbnInput('ISBN-13: 978‑0‑13‑235088‑4')).toBe('9780132350884')
  })

  it('identifies the exact invalid check digit from the reported form value', () => {
    expect(isbnInputError('9780062638500')).toBe('Incorrect check digit. The final digit must be 2.')
  })
})
