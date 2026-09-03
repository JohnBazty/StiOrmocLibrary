import { Router } from 'express'
import { assetCodeController, createAssetCodeController } from './asset-code.controller.ts'

type AssetController = ReturnType<typeof createAssetCodeController>

export function createResearchAssetRouter(assets: AssetController = assetCodeController) {
  const router = Router()
  router.get('/assets/:id', assets.adminResearchAsset)
  router.get('/assets/:id/barcode.png', assets.researchBarcodePng)
  router.get('/assets/:id/qr.png', assets.researchQrPng)
  return router
}

export const researchAssetRouter = createResearchAssetRouter()
