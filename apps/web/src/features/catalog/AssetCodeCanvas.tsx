import { useEffect, useRef, useState } from 'react'

export async function renderAssetDataUri(canvas: HTMLCanvasElement, dataUri: string, cssWidth: number, cssHeight: number, heading?: string, footer?: string) {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('The asset image could not be decoded.'))
    image.src = dataUri
  })
  const density = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)
  canvas.width = Math.round(cssWidth * density)
  canvas.height = Math.round(cssHeight * density)
  canvas.style.width = '100%'
  canvas.style.maxWidth = `${cssWidth}px`
  canvas.style.height = 'auto'
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')
  context.setTransform(density, 0, 0, density, 0, 0)
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, cssWidth, cssHeight)
  const topSpace = heading ? 30 : 0
  const bottomSpace = footer ? 30 : 0
  const imageHeight = cssHeight - topSpace - bottomSpace
  const scale = Math.min(cssWidth / image.naturalWidth, imageHeight / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.imageSmoothingEnabled = false
  if (heading) {
    context.fillStyle = '#003399'
    context.font = '900 13px Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(heading, cssWidth / 2, 15)
  }
  context.drawImage(image, (cssWidth - width) / 2, topSpace + (imageHeight - height) / 2, width, height)
  if (footer) {
    context.fillStyle = '#003399'
    context.font = '700 12px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(footer, cssWidth / 2, cssHeight - 14)
  }
}

export async function downloadCanvasPng(canvasId: string, filename: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null
  if (!canvas) throw new Error('The label canvas is not ready.')
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The PNG image could not be encoded.')), 'image/png'))
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[^A-Za-z0-9._-]/g, '-')
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function AssetCodeCanvas({ dataUri, kind, testId, canvasId, heading, footer }: { dataUri: string; kind: 'QR code' | 'Barcode'; testId?: string; canvasId?: string; heading?: string; footer?: string }) {
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setError(false)
    void renderAssetDataUri(canvas, dataUri, kind === 'QR code' ? 220 : 440, 220, heading, footer).catch(() => setError(true))
  }, [dataUri, footer, heading, kind, testId])
  return error
    ? <div role="alert" className="flex min-h-52 items-center justify-center p-4 text-center text-sm font-semibold text-[#003399]">{kind} preview unavailable.</div>
    : <canvas id={canvasId} ref={canvasRef} role="img" aria-label={`${heading ? `${heading} ` : ''}${kind} image${footer ? ` ${footer}` : ''}`} data-testid={testId} className="max-w-full" />
}
