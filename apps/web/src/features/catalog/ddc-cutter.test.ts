import { describe, expect, it } from 'vitest'
import { describeDdcCode, generateDdcAndCutter } from './ddc-cutter'

describe('generateDdcAndCutter', () => {
  it('identifies the classification and generates DDC + Cutter matching the STI Excel sheets', () => {
    const pascasio = generateDdcAndCutter({
      title: 'Basic English for College',
      author: 'Emy M. Pascasio',
    })
    expect(pascasio.ddcCode).toBe('428')
    expect(pascasio.cutter).toBe('P373')
    expect(pascasio.callNumber).toBe('428 P373')
    expect(pascasio.subject).toContain('English')

    const sti = generateDdcAndCutter({
      title: 'Basic Writing Skills',
      author: 'STI',
    })
    expect(sti.ddcCode).toBe('808.042')
    expect(sti.cutter).toBe('S75')
    expect(sti.callNumber).toBe('808.042 S75')

    const klausen = generateDdcAndCutter({
      title: 'Java 1: Basic syntax and semantics',
      author: 'Poul Klausen',
    })
    expect(klausen.ddcCode).toBe('005.133')
    expect(klausen.cutter).toBe('K538')
    expect(klausen.callNumber).toBe('005.133 K538')
  })

  it('uses an entered Dewey number when provided and generates the author Cutter', () => {
    const manual = generateDdcAndCutter({
      title: 'Clean Code',
      author: 'Robert C. Martin',
      deweyCode: '005.1',
    })
    expect(manual.ddcCode).toBe('005.1')
    expect(manual.cutter).toBe('M378')
    expect(manual.callNumber).toBe('005.1 M378')
    expect(describeDdcCode('005.1')).toContain('Software engineering')
  })
})
