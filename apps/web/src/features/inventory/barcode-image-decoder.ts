/**
 * High-contrast, zero-DOM-conflict Code-128 barcode decoder for STI copy labels.
 *
 * Uses the RED channel (which gives maximum contrast for STI's #003399 blue bars as well as
 * black bars), sub-pixel threshold crossing interpolation, tight local adaptive thresholding
 * for bright/glaring phone screens, and strict Code-128 Mod-103 checksum verification.
 */

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const MAX_CODE_LENGTH = 100

/** Standard ISO/IEC 15417 Code-128 patterns (0..105 = 6 runs summing to 11; 106 Stop = 7 runs summing to 13). */
const CODE128_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
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

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

/** Extracts a valid library barcode from either a raw Code-128 value or a library tracking QR JSON string. */
export function normalizeScannedBarcode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { barcode?: unknown; accession_number?: unknown }
      const fromQr =
        typeof parsed.barcode === 'string' && parsed.barcode.trim()
          ? parsed.barcode.trim()
          : typeof parsed.accession_number === 'string' && parsed.accession_number.trim()
            ? parsed.accession_number.trim()
            : null
      if (fromQr && fromQr.length <= MAX_CODE_LENGTH && !CONTROL_CHARACTERS.test(fromQr)) {
        return fromQr
      }
    } catch {
      /* Not JSON; continue as literal text. */
    }
  }
  if (trimmed.length > MAX_CODE_LENGTH || CONTROL_CHARACTERS.test(trimmed)) return null
  return trimmed
}

function scanlineToRuns(vals: Float32Array, threshFn: (x: number) => number, minRun = 0.45) {
  const runs: number[] = []
  const startBlack = vals[0] < threshFn(0)
  let prevBlack = startBlack
  let lastCross = 0
  for (let x = 1; x < vals.length; x++) {
    const v0 = vals[x - 1] - threshFn(x - 1)
    const v1 = vals[x] - threshFn(x)
    const isBlack = v1 < 0
    if (isBlack !== prevBlack) {
      const denom = v0 - v1
      const frac = denom === 0 ? 0.5 : Math.max(0, Math.min(1, v0 / denom))
      const cross = x - 1 + frac
      runs.push(cross - lastCross)
      lastCross = cross
      prevBlack = isBlack
    }
  }
  runs.push(vals.length - lastCross)
  if (minRun > 0) {
    for (let i = 1; i < runs.length - 1; ) {
      if (runs[i] < minRun) {
        runs[i - 1] += runs[i] + runs[i + 1]
        runs.splice(i, 2)
      } else {
        i++
      }
    }
  }
  return { runs, startBlack }
}

function decodeCode128Runs(runs: number[], startBlack: boolean): string | null {
  const firstBlack = startBlack ? 0 : 1
  for (let startIdx = firstBlack; startIdx + 18 <= runs.length; startIdx += 2) {
    const sum6 =
      runs[startIdx] +
      runs[startIdx + 1] +
      runs[startIdx + 2] +
      runs[startIdx + 3] +
      runs[startIdx + 4] +
      runs[startIdx + 5]
    if (sum6 <= 0) continue
    const unit = sum6 / 11
    if (unit < 0.7) continue
    // Quiet zone before start bar (at least 4 modules of white).
    if (startIdx > 0 && runs[startIdx - 1] < unit * 4.0) continue

    let bestStart = -1
    let bestStartErr = 1.9
    for (const code of [103, 104, 105]) {
      const pat = CODE128_PATTERNS[code]
      let err = 0
      for (let k = 0; k < 6; k++) err += Math.abs(runs[startIdx + k] / unit - pat[k])
      if (err < bestStartErr) {
        bestStartErr = err
        bestStart = code
      }
    }
    if (bestStart === -1) continue

    const codes = [bestStart]
    let totalErr = bestStartErr
    let pos = startIdx + 6
    let foundStop = false
    let curUnit = unit

    while (pos + 6 <= runs.length) {
      if (pos + 7 <= runs.length && codes.length >= 3) {
        const s7 =
          runs[pos] +
          runs[pos + 1] +
          runs[pos + 2] +
          runs[pos + 3] +
          runs[pos + 4] +
          runs[pos + 5] +
          runs[pos + 6]
        const u7 = s7 / 13
        const trailOk = pos + 7 === runs.length || runs[pos + 7] >= u7 * 4.0
        if (trailOk && u7 > curUnit * 0.6 && u7 < curUnit * 1.5) {
          const stopPat = CODE128_PATTERNS[106]
          let stopErr = 0
          for (let k = 0; k < 7; k++) stopErr += Math.abs(runs[pos + k] / u7 - stopPat[k])
          if (stopErr < 2.2) {
            foundStop = true
            break
          }
        }
      }

      const s6 =
        runs[pos] + runs[pos + 1] + runs[pos + 2] + runs[pos + 3] + runs[pos + 4] + runs[pos + 5]
      const u6 = s6 / 11
      if (u6 < curUnit * 0.6 || u6 > curUnit * 1.5) break

      let bestC = -1
      let minE = 2.0
      for (let c = 0; c < 106; c++) {
        const pat = CODE128_PATTERNS[c]
        let e = 0
        for (let k = 0; k < 6; k++) e += Math.abs(runs[pos + k] / u6 - pat[k])
        if (e < minE) {
          minE = e
          bestC = c
        }
      }
      if (bestC === -1) break
      codes.push(bestC)
      totalErr += minE
      curUnit = curUnit * 0.7 + u6 * 0.3
      pos += 6
    }

    if (!foundStop || codes.length < 3) continue
    // Strict average symbol fit prevents false positives on noisy backgrounds.
    if (totalErr / codes.length > 1.25) continue

    // Verify exact ISO/IEC 15417 Mod-103 checksum.
    const checkCode = codes[codes.length - 1]
    let checksum = codes[0]
    for (let i = 1; i < codes.length - 1; i++) checksum += codes[i] * i
    if (checksum % 103 !== checkCode) continue

    let mode: 'A' | 'B' | 'C' = codes[0] === 103 ? 'A' : codes[0] === 104 ? 'B' : 'C'
    let text = ''
    for (let i = 1; i < codes.length - 1; i++) {
      const c = codes[i]
      if (mode === 'C') {
        if (c === 100) mode = 'B'
        else if (c === 101) mode = 'A'
        else if (c < 100) text += String(c).padStart(2, '0')
      } else {
        if (c === 99) mode = 'C'
        else if (c === 100 && mode === 'A') mode = 'B'
        else if (c === 101 && mode === 'B') mode = 'A'
        else if (c < 95) text += String.fromCharCode(c + 32)
      }
    }
    const clean = normalizeScannedBarcode(text)
    if (clean && clean.length >= 2) return clean
  }
  return null
}

function decodeRowSignal(row: Float32Array): string | null {
  const W = row.length
  let minV = 255
  let maxV = 0
  for (let x = 0; x < W; x++) {
    const v = row[x]
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  if (maxV - minV < 24) return null

  // 1. Fast global midpoint + offset pass (instant on crisp PNGs & clear webcam frames).
  const midGlobal = (minV + maxV) * 0.5
  for (const frac of [0, 0.08, -0.08, 0.16, -0.16]) {
    const t = midGlobal + (maxV - minV) * frac
    const { runs, startBlack } = scanlineToRuns(row, () => t, 0.45)
    const hit = decodeCode128Runs(runs, startBlack)
    if (hit) return hit
    // Also try reversed scanline (handles upside-down held books or mirrored webcams).
    const revRuns = [...runs].reverse()
    const revStartBlack = (runs.length % 2 === 1) ? startBlack : !startBlack
    const revHit = decodeCode128Runs(revRuns, revStartBlack)
    if (revHit) return revHit
  }

  // 2. Tight-window local adaptive threshold pass (handles phone-screen glow & uneven lighting).
  const thresh = new Float32Array(W)
  for (const win of [6, 12]) {
    for (let x = 0; x < W; x++) {
      let lo = 255
      let hi = 0
      const a = Math.max(0, x - win)
      const b = Math.min(W - 1, x + win)
      for (let k = a; k <= b; k++) {
        const v = row[k]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      thresh[x] = hi - lo < 20 ? midGlobal : (lo + hi) * 0.5
    }
    for (const bias of [0, 6, -6]) {
      const { runs, startBlack } = scanlineToRuns(row, x => thresh[x] + bias, 0.5)
      const hit = decodeCode128Runs(runs, startBlack)
      if (hit) return hit
      const revRuns = [...runs].reverse()
      const revStartBlack = (runs.length % 2 === 1) ? startBlack : !startBlack
      const revHit = decodeCode128Runs(revRuns, revStartBlack)
      if (revHit) return revHit
    }
  }
  return null
}

/**
 * Pure RGBA pixel decoder for Code-128 barcodes.
 * Reads the RED channel first (optimal for STI's #003399 navy blue bars AND black bars),
 * scanning multiple horizontal bands across the image.
 */
export function decodeCode128FromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxBands = 15,
): string | null {
  if (width < 40 || height < 4) return null
  const row = new Float32Array(width)
  const step = Math.max(1, Math.floor(height / (maxBands + 1)))

  // Scan outward from the vertical center first (most barcodes sit near the center).
  const ys: number[] = []
  const midY = Math.floor(height / 2)
  ys.push(midY)
  for (let offset = step; offset < height / 2; offset += step) {
    if (midY - offset >= 1) ys.push(midY - offset)
    if (midY + offset < height - 1) ys.push(midY + offset)
  }

  for (const y of ys) {
    // 3-row mini vertical average on RED channel reduces sensor noise without blurring slight tilts.
    const y0 = Math.max(0, y - 1)
    const y2 = Math.min(height - 1, y + 1)
    for (let x = 0; x < width; x++) {
      row[x] = (data[(y0 * width + x) * 4] + data[(y * width + x) * 4] + data[(y2 * width + x) * 4]) / 3
    }
    const hit = decodeRowSignal(row)
    if (hit) return hit
  }
  return null
}

function drawRedContrastCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  rotateDeg = 0,
): HTMLCanvasElement | null {
  const pad = 40
  const rad = (rotateDeg * Math.PI) / 180
  const swap = Math.abs(rotateDeg) === 90
  const drawW = swap ? srcH : srcW
  const drawH = swap ? srcW : srcH
  const canvas = document.createElement('canvas')
  canvas.width = drawW + pad * 2
  canvas.height = drawH + pad * 2
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (rotateDeg !== 0) ctx.rotate(rad)
  ctx.drawImage(source, 0, 0, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH)
  return canvas
}

async function tryNativeBarcodeDetector(canvas: HTMLCanvasElement): Promise<string | null> {
  const DetectorCtor = (window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => NativeBarcodeDetector
  }).BarcodeDetector
  if (!DetectorCtor) return null
  try {
    const detector = new DetectorCtor({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] })
    const hits = await detector.detect(canvas)
    for (const entry of hits) {
      if (entry.rawValue) {
        const clean = normalizeScannedBarcode(entry.rawValue)
        if (clean) return clean
      }
    }
  } catch {
    /* Native BarcodeDetector unavailable or unsupported format. */
  }
  return null
}

/**
 * Isolated per-call Html5Qrcode file scan fallback (handles QR codes, Code 39, EAN, and rotated labels)
 * using a dedicated off-screen 900px container that is created and cleaned up per call — never collides
 * with live camera scanning or `.sr-only` 1px width limits.
 */
async function tryIsolatedHtml5QrcodeScan(file: File): Promise<string | null> {
  const host = document.createElement('div')
  const id = `sti-barcode-decode-${Math.random().toString(36).slice(2)}`
  host.id = id
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.width = '900px'
  host.style.height = '500px'
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)

  try {
    const { Html5Qrcode: Reader, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
    const formats = [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
    ].filter((f): f is number => typeof f === 'number')
    const reader = new Reader(id, {
      formatsToSupport: formats.length ? formats : [Html5QrcodeSupportedFormats.CODE_128],
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    })
    try {
      const raw = await reader.scanFile(file, false)
      return normalizeScannedBarcode(raw)
    } finally {
      try {
        reader.clear()
      } catch {
        /* Ignore cleanup errors. */
      }
    }
  } catch {
    return null
  } finally {
    host.remove()
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Fast, non-blocking decoder for a live webcam `<video>` frame.
 * Runs pure offscreen RGBA Code-128 scanlines (RED channel) plus optional tilt passes.
 */
export async function decodeLiveVideoFrame(
  video: HTMLVideoElement,
  thorough = false,
): Promise<string | null> {
  if (video.readyState < 2 || video.videoWidth < 80 || video.videoHeight < 80) return null
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cropW = Math.floor(vw * 0.96)
  const cropH = Math.floor(vh * 0.66)
  const cropX = Math.floor((vw - cropW) / 2)
  const cropY = Math.floor((vh - cropH) / 2)
  const pad = 32

  const base = document.createElement('canvas')
  base.width = cropW + pad * 2
  base.height = cropH + pad * 2
  const bctx = base.getContext('2d', { willReadFrequently: true })
  if (!bctx) return null
  bctx.fillStyle = '#ffffff'
  bctx.fillRect(0, 0, base.width, base.height)
  bctx.drawImage(video, cropX, cropY, cropW, cropH, pad, pad, cropW, cropH)

  // 1. Native BarcodeDetector (if browser supports it).
  const nativeHit = await tryNativeBarcodeDetector(base)
  if (nativeHit) return nativeHit

  // 2. Pure-TS RED-channel sub-pixel Code-128 scanlines (0° fast pass).
  const imgData = bctx.getImageData(0, 0, base.width, base.height)
  const fastHit = decodeCode128FromRgba(imgData.data, base.width, base.height, thorough ? 24 : 13)
  if (fastHit) return fastHit

  if (!thorough) return null

  // 3. Thorough mode (on "Scan current frame now"): try slight tilts + isolated Html5Qrcode pass.
  for (const deg of [-3, 3, -1.5, 1.5]) {
    const rot = drawRedContrastCanvas(base, base.width, base.height, deg)
    if (!rot) continue
    const rctx = rot.getContext('2d', { willReadFrequently: true })
    if (!rctx) continue
    const rd = rctx.getImageData(0, 0, rot.width, rot.height)
    const hit = decodeCode128FromRgba(rd.data, rot.width, rot.height, 18)
    if (hit) return hit
  }

  // Convert RED channel to pure high-contrast grayscale PNG and run isolated Html5Qrcode fallback.
  const redCanvas = document.createElement('canvas')
  redCanvas.width = base.width
  redCanvas.height = base.height
  const rctx = redCanvas.getContext('2d', { willReadFrequently: true })
  if (rctx) {
    const copy = new ImageData(new Uint8ClampedArray(imgData.data), base.width, base.height)
    const d = copy.data
    let lo = 255
    let hi = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < lo) lo = d[i]
      if (d[i] > hi) hi = d[i]
    }
    const span = Math.max(1, hi - lo)
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / span)))
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
    rctx.putImageData(copy, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => redCanvas.toBlob(resolve, 'image/png'))
    if (blob) {
      const hit = await tryIsolatedHtml5QrcodeScan(new File([blob], 'capture.png', { type: 'image/png' }))
      if (hit) return hit
    }
  }
  return null
}

/**
 * Multi-pass decoder for an uploaded barcode/QR image file (PNG, JPG, WebP).
 * Works cleanly for downloaded STI blue (#003399) Code-128 PNGs, QR labels, screenshots, and photos.
 */
export async function decodeUploadedBarcodeFile(file: File): Promise<string | null> {
  const img = await loadImageElement(file)
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    // Cap oversized phone photos to max 1600px on longest side for fast, sharp decoding.
    const maxDim = 1600
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * ratio))
    const h = Math.max(1, Math.round(img.naturalHeight * ratio))

    const base = drawRedContrastCanvas(img, w, h, 0)
    if (base) {
      const nativeHit = await tryNativeBarcodeDetector(base)
      if (nativeHit) return nativeHit

      const ctx = base.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        const d = ctx.getImageData(0, 0, base.width, base.height)
        const hit = decodeCode128FromRgba(d.data, base.width, base.height, 28)
        if (hit) return hit
      }
    }

    // Try 90-degree rotation (vertical barcode photos) and slight tilts (-2.5, +2.5 deg).
    for (const deg of [90, -2.5, 2.5]) {
      const rot = drawRedContrastCanvas(img, w, h, deg)
      if (!rot) continue
      const rctx = rot.getContext('2d', { willReadFrequently: true })
      if (!rctx) continue
      const rd = rctx.getImageData(0, 0, rot.width, rot.height)
      const hit = decodeCode128FromRgba(rd.data, rot.width, rot.height, 20)
      if (hit) return hit
    }
  }

  // Final isolated Html5Qrcode pass (supports QR codes, Code 39, EAN-13, and original file bytes).
  return tryIsolatedHtml5QrcodeScan(file)
}
