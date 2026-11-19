import { describe, expect, it } from 'vitest'
import { decodeCode128FromRgba, normalizeScannedBarcode } from './barcode-image-decoder'

/** Minimal ISO/IEC 15417 Code-128B encoder for generating real synthetic RGBA test barcodes. */
const PATTERNS_B: ReadonlyArray<ReadonlyArray<number>> = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],[1,3,1,2,2,2],
  [1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],[2,2,1,3,1,2],[2,3,1,2,1,2],
  [1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],[1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],
  [2,2,3,2,1,1],[2,2,1,1,3,2],[2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],
  [3,1,1,2,2,2],[3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],[1,3,1,3,2,1],
  [1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],[2,3,1,1,1,3],[2,3,1,3,1,1],
  [1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],[1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],
  [3,1,3,1,2,1],[2,1,1,3,3,1],[2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],
  [3,1,1,1,2,3],[3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],[1,2,1,1,2,4],
  [1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],[1,1,2,4,1,2],[1,2,2,1,1,4],
  [1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],[2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],
  [2,4,1,1,1,2],[1,3,4,1,1,1],[1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],
  [1,2,4,1,1,2],[1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],[1,1,4,1,1,3],
  [1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],[1,1,4,1,3,1],[3,1,1,1,4,1],
  [4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],[2,1,1,2,3,2],[2,3,3,1,1,1,2],
]

function renderSyntheticCode128Rgba(
  text: string,
  opts: {
    barRgb?: [number, number, number]
    bgRgb?: [number, number, number]
    modulePx?: number
    reverse?: boolean
    gradient?: boolean
  } = {},
) {
  const {
    barRgb = [0, 51, 153], // STI #003399 navy blue bars
    bgRgb = [255, 255, 255],
    modulePx = 3,
    reverse = false,
    gradient = false,
  } = opts
  const codes = [104] // Start B
  for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i) - 32)
  let sum = codes[0]
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i
  codes.push(sum % 103)
  codes.push(106)

  const bits: number[] = []
  for (let i = 0; i < 12; i++) bits.push(0) // quiet zone
  for (const c of codes) {
    const pat = PATTERNS_B[c]
    let dark = 1
    for (const run of pat) {
      for (let r = 0; r < run; r++) bits.push(dark)
      dark = 1 - dark
    }
  }
  for (let i = 0; i < 12; i++) bits.push(0) // trailing quiet zone
  if (reverse) bits.reverse()

  const width = bits.length * modulePx
  const height = 40
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = bits[Math.floor(x / modulePx)]
      const shade = gradient ? Math.round((x / width) * 65) : 0
      const rgb = bit ? barRgb : bgRgb
      const idx = (y * width + x) * 4
      data[idx] = Math.max(0, Math.min(255, rgb[0] - shade))
      data[idx + 1] = Math.max(0, Math.min(255, rgb[1] - shade))
      data[idx + 2] = Math.max(0, Math.min(255, rgb[2] - shade))
      data[idx + 3] = 255
    }
  }
  return { data, width, height }
}

describe('barcode-image-decoder', () => {
  it('decodes STI #003399 blue Code-128 barcodes and preserves leading zeros', () => {
    const a = renderSyntheticCode128Rgba('STIORMOC2026000086')
    expect(decodeCode128FromRgba(a.data, a.width, a.height)).toBe('STIORMOC2026000086')

    const b = renderSyntheticCode128Rgba('000123')
    expect(decodeCode128FromRgba(b.data, b.width, b.height)).toBe('000123')
  })

  it('decodes upside-down/mirrored barcodes and uneven-lighting phone screens', () => {
    const rev = renderSyntheticCode128Rgba('STIORMOC2026000086', { reverse: true })
    expect(decodeCode128FromRgba(rev.data, rev.width, rev.height)).toBe('STIORMOC2026000086')

    const glared = renderSyntheticCode128Rgba('STIORMOC2026000008', {
      barRgb: [70, 95, 165],
      bgRgb: [235, 240, 248],
      gradient: true,
    })
    expect(decodeCode128FromRgba(glared.data, glared.width, glared.height)).toBe('STIORMOC2026000008')
  })

  it('extracts copy barcodes from library QR JSON payloads and rejects control characters', () => {
    expect(
      normalizeScannedBarcode('{"title_id":42,"barcode":"STIORMOC2026000086","accession_number":"STI-ACC-2026-000086"}'),
    ).toBe('STIORMOC2026000086')
    expect(normalizeScannedBarcode('bad\u0007code')).toBeNull()
    expect(normalizeScannedBarcode('   ')).toBeNull()
  })

  it('returns null on blank frames without false positives', () => {
    const blank = new Uint8ClampedArray(300 * 40 * 4).fill(240)
    expect(decodeCode128FromRgba(blank, 300, 40)).toBeNull()
  })
})
