import { describe, expect, it } from 'vitest'
import { scanMessage } from './StocktakePage'

describe('stocktake scan message', () => {
  it('names the chosen condition by its label, not its stored key', () => {
    const lookup = { found: true, code: 'B1', inScope: false, alreadyCounted: false, item: { kind: 'book', title: 'Panitikan', accession: 'A1', barcode: 'B1', shelf: 'AISLE 3', condition: 'Good', availability: 'Available', lifecycle: 'Active', loan: 'none' } }
    const message = scanMessage({ scanResult: { inventory: { status: 'none' } } } as never, lookup as never, 'B1', 'good')
    expect(message.text).toContain('as Good')
    expect(message.text).not.toContain('as good')
  })
})
