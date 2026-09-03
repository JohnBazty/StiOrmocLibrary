import type { NextFunction, Request, Response } from 'express'
import { assetCodeService, createAssetCodeService } from './asset-code.service.ts'

type Service = ReturnType<typeof createAssetCodeService>

function asyncController(handler: (request: Request, response: Response) => Promise<void>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { await handler(request, response) } catch (error) { next(error) }
  }
}

export function createAssetCodeController(service: Service = assetCodeService) {
  const png = (kind: 'barcode' | 'qr', assetType: 'book' | 'research' = 'book') => asyncController(async (request, response) => {
    const asset = assetType === 'research'
      ? await service.adminResearchPng(request.params.id, kind)
      : await service.adminPng(request.params.id, kind)
    response.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${asset.accessionNumber}-${kind}.png"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    })
    response.status(200).send(asset.buffer)
  })

  return {
    adminAsset: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.adminAsset(request.params.id) })
    }),
    adminResearchAsset: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.adminResearchAsset(request.params.id) })
    }),
    catalogAsset: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.catalogAsset(request.params.barcode) })
    }),
    barcodePng: png('barcode'),
    qrPng: png('qr'),
    researchBarcodePng: png('barcode', 'research'),
    researchQrPng: png('qr', 'research'),
  }
}

export const assetCodeController = createAssetCodeController()
