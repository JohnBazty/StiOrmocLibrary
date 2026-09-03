import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { renderBarcodePng, renderBookLabel, renderQrPng } from './book-label.renderer.ts'
import { findAdminAssetById, findAdminResearchAssetById, findCatalogAssetByBarcode } from './asset-code.repository.ts'

function positiveId(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'INVALID_PHYSICAL_COPY_ID', 'A valid physical copy ID is required.')
  }
  return parsed
}

export function normalizeAssetBarcode(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(422, 'INVALID_ASSET_BARCODE', 'A valid barcode is required.')
  const barcode = value.trim().toUpperCase()
  if (!barcode || barcode.length > 100 || /[\u0000-\u001F\u007F]/.test(barcode)) {
    throw new HttpError(422, 'INVALID_ASSET_BARCODE', 'A valid barcode is required.')
  }
  return barcode
}

function trackingPayload(asset: { titleId: number; barcode: string; accessionNumber: string }) {
  return { title_id: asset.titleId, barcode: asset.barcode, accession_number: asset.accessionNumber }
}

export function createAssetCodeService(database: Pool = db) {
  async function adminAsset(id: unknown) {
    const asset = await findAdminAssetById(database, positiveId(id))
    if (!asset) throw new HttpError(404, 'BOOK_ASSET_NOT_FOUND', 'The requested physical book copy was not found.')
    const rendered = await renderBookLabel(trackingPayload(asset))
    return {
      ...asset,
      qrCodeData: asset.qrCodeData?.startsWith('data:image/png;base64,') ? asset.qrCodeData : rendered.qrCodeData,
      barcodeImageData: rendered.barcodeImageData,
    }
  }

  async function adminResearchAsset(id: unknown) {
    const asset = await findAdminResearchAssetById(database, positiveId(id))
    if (!asset) throw new HttpError(404, 'RESEARCH_ASSET_NOT_FOUND', 'The requested research or thesis inventory record was not found.')
    const rendered = await renderBookLabel(trackingPayload(asset))
    return {
      ...asset,
      qrCodeData: asset.qrCodeData?.startsWith('data:image/png;base64,') ? asset.qrCodeData : rendered.qrCodeData,
      barcodeImageData: rendered.barcodeImageData,
    }
  }

  return {
    adminAsset,
    adminResearchAsset,
    async catalogAsset(barcodeInput: unknown) {
      const asset = await findCatalogAssetByBarcode(database, normalizeAssetBarcode(barcodeInput))
      if (!asset) throw new HttpError(404, 'BOOK_ASSET_NOT_FOUND', 'The requested physical book copy was not found.')
      const rendered = await renderBookLabel(trackingPayload(asset))
      return {
        physicalCopyId: asset.physicalCopyId,
        titleId: asset.titleId,
        title: asset.title,
        author: asset.author,
        accessionNumber: asset.accessionNumber,
        barcode: asset.barcode,
        shelfLocation: asset.shelfLocation,
        conditionStatus: asset.conditionStatus,
        barcodeImageData: rendered.barcodeImageData,
      }
    },
    async adminPng(id: unknown, kind: 'barcode' | 'qr') {
      const asset = await adminAsset(id)
      const buffer = kind === 'barcode'
        ? await renderBarcodePng(asset.barcode)
        : await renderQrPng(trackingPayload(asset), asset.qrCodeData)
      return { buffer, barcode: asset.barcode, accessionNumber: asset.accessionNumber, kind }
    },
    async adminResearchPng(id: unknown, kind: 'barcode' | 'qr') {
      const asset = await adminResearchAsset(id)
      const buffer = kind === 'barcode'
        ? await renderBarcodePng(asset.barcode)
        : await renderQrPng(trackingPayload(asset), asset.qrCodeData)
      return { buffer, barcode: asset.barcode, accessionNumber: asset.accessionNumber, kind }
    },
  }
}

export const assetCodeService = createAssetCodeService()
