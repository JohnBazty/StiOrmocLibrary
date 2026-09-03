import QRCode from 'qrcode'
import bwipjs from 'bwip-js'

export type TrackingPayload = { title_id: number; barcode: string; accession_number: string }

const qrOptions = {
  errorCorrectionLevel: 'H' as const, margin: 2, width: 640,
  color: { dark: '#003399', light: '#FFFFFF' },
}

const barcodeOptions = (barcode: string, includeText: boolean) => ({
  bcid: 'code128', text: barcode, scale: 4, height: 20,
  includetext: includeText, textxalign: 'center', textsize: 11,
  paddingwidth: 10, paddingheight: 6,
  backgroundcolor: 'FFFFFF', barcolor: '003399', textcolor: '003399',
} as const)

export async function renderBookLabel(payload: TrackingPayload) {
  const trackingJson = JSON.stringify(payload)
  const qrCodeData = await QRCode.toDataURL(trackingJson, qrOptions)
  const barcodeSvg = bwipjs.toSVG(barcodeOptions(payload.barcode, false))
  return {
    trackingJson,
    qrCodeData,
    barcodeImageData: `data:image/svg+xml;base64,${Buffer.from(barcodeSvg, 'utf8').toString('base64')}`,
  }
}

export async function renderBarcodePng(barcode: string) {
  return bwipjs.toBuffer(barcodeOptions(barcode, true))
}

export async function renderQrPng(payload: TrackingPayload, storedDataUri?: string | null) {
  if (storedDataUri?.startsWith('data:image/png;base64,')) {
    const decoded = Buffer.from(storedDataUri.slice(storedDataUri.indexOf(',') + 1), 'base64')
    if (decoded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return decoded
  }
  return QRCode.toBuffer(JSON.stringify(payload), qrOptions)
}
