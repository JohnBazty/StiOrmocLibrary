import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCanvasPng } from './AssetCodeCanvas'

describe('canvas PNG exporter', () => {
  it('encodes the active high-density canvas as an image/png download', async () => {
    const canvas = document.createElement('canvas')
    canvas.id = 'asset-canvas'
    canvas.toBlob = (callback, type) => { expect(type).toBe('image/png'); callback(new Blob(['png'], { type: 'image/png' })) }
    document.body.appendChild(canvas)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:asset'), revokeObjectURL: vi.fn() })
    await downloadCanvasPng('asset-canvas', 'STI-ACC-2026-000142 barcode.png')
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('STI-ACC-2026-000142-barcode.png')
  })
})

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
