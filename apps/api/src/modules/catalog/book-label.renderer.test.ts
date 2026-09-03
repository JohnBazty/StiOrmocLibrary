import assert from 'node:assert/strict'
import test from 'node:test'
import { renderBookLabel } from './book-label.renderer.ts'

test('renders a high-density Base64 QR image and a Base64 Code 128 SVG', async () => {
  const payload = { title_id: 8, barcode: 'STIORMOC2026000142', accession_number: 'STI-ACC-2026-000142' }
  const result = await renderBookLabel(payload)
  assert.equal(result.trackingJson, JSON.stringify(payload))
  assert.match(result.qrCodeData, /^data:image\/png;base64,/)
  assert.match(result.barcodeImageData, /^data:image\/svg\+xml;base64,/)
  const svg = Buffer.from(result.barcodeImageData.split(',')[1], 'base64').toString('utf8')
  assert.match(svg, /<svg/)
  assert.match(svg, /stroke="#003399"/)
})
