import { Camera, Check, ImageUp, RefreshCw, RotateCcw, ScanBarcode, Video } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { barcodeScanBox } from '../../components/scanner-viewport'

/** The same label must be read twice within this window before it counts. This drops blurred or half-read frames. */
const CONFIRM_WINDOW_MS = 1000
/** After a label is accepted, the same label is ignored for this long so one held-up label is not counted twice. */
const REPEAT_HOLD_MS = 3000
const MAX_CODE_LENGTH = 100
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const HD_ASSIST_INTERVAL_MS = 850

type CameraDevice = { id: string; label: string }
type Props = { paused: boolean; onDetected: (code: string) => void }
type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

function cameraMessage(reason: unknown) {
  const name = reason instanceof Error ? reason.name : ''
  const text = reason instanceof Error ? reason.message : String(reason)
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Cameras only work on a secure (https) page. Open the library site with https, or type the code instead.'
  }
  if (/NotAllowed|PermissionDenied|SecurityError/i.test(name) || /permission|denied/i.test(text)) {
    return 'Camera access is blocked. Allow the camera in the address bar, then try again. You can also type the code.'
  }
  if (/NotFound|DevicesNotFound/i.test(name) || /not found|no camera/i.test(text)) {
    return 'No camera was found on this computer. Connect a webcam, or type the code instead.'
  }
  if (/NotReadable|TrackStart/i.test(name)) {
    return 'The camera is being used by another app. Close that app, then try again.'
  }
  return 'The camera could not start. Try again, or type the code instead.'
}

function signalRead() {
  try {
    navigator.vibrate?.(60)
  } catch {
    /* Vibration is optional. */
  }
  try {
    const Audio = window.AudioContext
    if (!Audio) return
    const context = new Audio()
    const tone = context.createOscillator()
    const volume = context.createGain()
    volume.gain.value = 0.05
    tone.frequency.value = 880
    tone.connect(volume)
    volume.connect(context.destination)
    tone.start()
    tone.stop(context.currentTime + 0.12)
    tone.onended = () => void context.close()
  } catch {
    /* Sound is optional. */
  }
}

function isValidCode(text: string) {
  return Boolean(text) && text.length <= MAX_CODE_LENGTH && !CONTROL_CHARACTERS.test(text)
}

/**
 * Extracts a full-resolution horizontal strip from the live webcam <video>,
 * adds white quiet-zone padding, and stretches grayscale contrast so low-contrast
 * prints and bright phone screens decode reliably as Code-128.
 */
function buildEnhancedVideoCanvas(viewportId: string): HTMLCanvasElement | null {
  const host = document.getElementById(viewportId)
  const video = host?.querySelector('video')
  if (!video || video.readyState < 2 || video.videoWidth < 80 || video.videoHeight < 80) return null

  const vw = video.videoWidth
  const vh = video.videoHeight
  const cropW = Math.floor(vw * 0.96)
  const cropH = Math.floor(vh * 0.62)
  const cropX = Math.floor((vw - cropW) / 2)
  const cropY = Math.floor((vh - cropH) / 2)
  const pad = 36

  const canvas = document.createElement('canvas')
  canvas.width = cropW + pad * 2
  canvas.height = cropH + pad * 2
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(video, cropX, cropY, cropW, cropH, pad, pad, cropW, cropH)

  try {
    const img = ctx.getImageData(pad, pad, cropW, cropH)
    const data = img.data
    let minLum = 255
    let maxLum = 0
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
      if (lum < minLum) minLum = lum
      if (lum > maxLum) maxLum = lum
    }
    const span = Math.max(1, maxLum - minLum)
    // Trim 12% highlights/shadows so phone LCD glow becomes crisp black bars on white.
    const low = minLum + span * 0.14
    const high = maxLum - span * 0.12
    const range = Math.max(1, high - low)
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
      const norm = Math.max(0, Math.min(255, Math.round(((lum - low) * 255) / range)))
      data[i] = norm
      data[i + 1] = norm
      data[i + 2] = norm
    }
    ctx.putImageData(img, pad, pad)
  } catch {
    /* Return unenhanced high-res canvas if pixel access is restricted. */
  }
  return canvas
}

async function decodeCanvasCode128(canvas: HTMLCanvasElement, helperElementId: string): Promise<string | null> {
  // 1. Try browser-native BarcodeDetector first when supported (macOS / Android / ChromeOS).
  const DetectorCtor = (window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => NativeBarcodeDetector
  }).BarcodeDetector
  if (DetectorCtor) {
    try {
      const detector = new DetectorCtor({ formats: ['code_128'] })
      const hits = await detector.detect(canvas)
      const hit = hits.find(entry => entry.rawValue?.trim())?.rawValue?.trim()
      if (hit && isValidCode(hit)) return hit
    } catch {
      /* Fall back to Html5Qrcode full-resolution decodeRobustlyAsync. */
    }
  }

  // 2. Fall back to Html5Qrcode scanFile (runs decodeRobustlyAsync at native resolution + quiet-zone padding).
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return null
  const file = new File([blob], 'frame.png', { type: 'image/png' })
  return decodeImageFileCode128(file, helperElementId)
}

async function decodeImageFileCode128(file: File, helperElementId: string): Promise<string | null> {
  const { Html5Qrcode: Reader, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
  const helper = new Reader(helperElementId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
    verbose: false,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  })
  try {
    const raw = await helper.scanFile(file, false)
    const text = raw.trim()
    return isValidCode(text) ? text : null
  } catch {
    return null
  } finally {
    try {
      helper.clear()
    } catch {
      /* Helper element may already be empty. */
    }
  }
}

/** Keeps the webcam open between items and reports each confirmed Code 128 copy label once. */
export function StocktakeCameraScanner({ paused, onDetected }: Props) {
  const uid = useId().replaceAll(':', '')
  const viewportId = `stocktake-camera-${uid}`
  const helperViewportId = `stocktake-camera-helper-${uid}`
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [cameraId, setCameraId] = useState('')
  const [activeDeviceId, setActiveDeviceId] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [candidateCode, setCandidateCode] = useState<string | null>(null)
  const [cooldownCode, setCooldownCode] = useState<string | null>(null)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [captureFeedback, setCaptureFeedback] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null)

  const pausedRef = useRef(paused)
  const detectedRef = useRef(onDetected)
  const releasingRef = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef<{ text: string; at: number } | null>(null)
  const accepted = useRef<{ text: string; at: number } | null>(null)
  const assistBusyRef = useRef(false)
  const readHandlerRef = useRef<(raw: string) => void>(() => undefined)

  pausedRef.current = paused
  detectedRef.current = onDetected

  const acceptImmediately = (raw: string) => {
    const text = raw.trim()
    if (pausedRef.current || !isValidCode(text)) return
    pending.current = null
    accepted.current = { text, at: Date.now() }
    setCandidateCode(null)
    setCooldownCode(text)
    setCaptureFeedback(null)
    signalRead()
    detectedRef.current(text)
  }

  useEffect(() => {
    // The pop-up took time. Restart the hold so the book still in view is not detected again as soon as it closes.
    if (!paused && accepted.current) {
      accepted.current = { ...accepted.current, at: Date.now() }
      setCooldownCode(accepted.current.text)
    }
    pending.current = null
    setCandidateCode(null)
  }, [paused])

  useEffect(() => {
    let cancelled = false
    let scanner: Html5Qrcode | null = null
    const release = async () => {
      const current = scanner
      scanner = null
      if (!current) return
      try {
        if (current.isScanning) await current.stop()
        current.clear()
      } catch {
        /* The camera may already be released. */
      }
    }
    const read = (raw: string) => {
      const text = raw.trim()
      if (pausedRef.current || !isValidCode(text)) return
      const now = Date.now()
      const held = accepted.current
      if (held && held.text === text && now - held.at < REPEAT_HOLD_MS) {
        setCooldownCode(text)
        return
      }
      if (held && now - held.at >= REPEAT_HOLD_MS) {
        setCooldownCode(null)
      }
      const first = pending.current
      if (!first || first.text !== text || now - first.at > CONFIRM_WINDOW_MS) {
        pending.current = { text, at: now }
        setCandidateCode(text)
        return
      }
      pending.current = null
      accepted.current = { text, at: now }
      setCandidateCode(null)
      setCooldownCode(text)
      setCaptureFeedback(null)
      signalRead()
      detectedRef.current(text)
    }
    readHandlerRef.current = read

    async function begin() {
      setError('')
      setReady(false)
      setCandidateCode(null)
      setCaptureFeedback(null)
      await releasingRef.current
      if (cancelled) return
      try {
        const { Html5Qrcode: Reader, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (cancelled) return
        scanner = new Reader(viewportId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        })
        const source: MediaTrackConstraints = cameraId
          ? { deviceId: { exact: cameraId } }
          : { facingMode: 'environment' }
        await scanner.start(
          source,
          {
            fps: 18,
            qrbox: barcodeScanBox,
            disableFlip: false,
            videoConstraints: { ...source, width: { ideal: 1280 }, height: { ideal: 720 } },
          },
          read,
          () => undefined,
        )
        if (cancelled) {
          await release()
          return
        }
        setReady(true)
        const host = document.getElementById(viewportId)
        const activeVideo = host?.querySelector('video')
        const stream = activeVideo?.srcObject as MediaStream | null | undefined
        const trackDeviceId = stream?.getVideoTracks?.()[0]?.getSettings?.().deviceId
        if (trackDeviceId && !cancelled) setActiveDeviceId(trackDeviceId)
        const found = await Reader.getCameras().catch(() => [] as CameraDevice[])
        if (!cancelled) setCameras(found)
      } catch (reason) {
        await release()
        if (!cancelled) setError(cameraMessage(reason))
      }
    }
    void begin()
    return () => {
      cancelled = true
      setReady(false)
      releasingRef.current = releasingRef.current.then(release, release)
    }
  }, [viewportId, cameraId, attempt])

  // Automatic full-resolution contrast-boosted background assist for USB webcams & bright phone screens.
  useEffect(() => {
    if (!ready || paused || error) return
    const timer = window.setInterval(() => {
      if (pausedRef.current || assistBusyRef.current) return
      const canvas = buildEnhancedVideoCanvas(viewportId)
      if (!canvas) return
      assistBusyRef.current = true
      void decodeCanvasCode128(canvas, helperViewportId)
        .then(hit => {
          if (hit) readHandlerRef.current(hit)
        })
        .finally(() => {
          assistBusyRef.current = false
        })
    }, HD_ASSIST_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [ready, paused, error, viewportId, helperViewportId])

  async function handleManualCapture() {
    if (paused || captureBusy) return
    setCaptureBusy(true)
    setCaptureFeedback(null)
    try {
      const canvas = buildEnhancedVideoCanvas(viewportId)
      if (!canvas) {
        setCaptureFeedback({
          tone: 'warn',
          text: 'Camera video is still warming up. Wait a moment and try capturing again.',
        })
        return
      }
      const hit = await decodeCanvasCode128(canvas, helperViewportId)
      if (hit) {
        acceptImmediately(hit)
      } else {
        setCaptureFeedback({
          tone: 'warn',
          text: 'No Code-128 barcode was readable in that frame. Hold the label flat, leave white margin on both ends, reduce phone brightness/glare, and try again.',
        })
      }
    } finally {
      setCaptureBusy(false)
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || paused || captureBusy) return
    setCaptureBusy(true)
    setCaptureFeedback(null)
    try {
      const hit = await decodeImageFileCode128(file, helperViewportId)
      if (hit) {
        acceptImmediately(hit)
      } else {
        setCaptureFeedback({
          tone: 'warn',
          text: 'No Code-128 barcode was found in that image. Upload a sharper photo or screenshot of the copy label.',
        })
      }
    } finally {
      setCaptureBusy(false)
    }
  }

  function resetCooldown() {
    accepted.current = null
    pending.current = null
    setCooldownCode(null)
    setCandidateCode(null)
    setCaptureFeedback({ tone: 'info', text: 'Ready to scan the same label again.' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {cameras.length > 1 ? (
          <label className="min-w-[240px] flex-1 text-xs font-semibold text-[var(--sl-text-header)]">
            <span className="mb-1 inline-flex items-center gap-1.5">
              <Video size={14} className="text-[#0b5ea2] dark:text-[#93c5fd]" aria-hidden="true" />
              Camera
            </span>
            <select
              className="sl-input min-h-[38px] w-full"
              value={cameraId || activeDeviceId || cameras[0].id}
              onChange={event => setCameraId(event.target.value)}
            >
              {cameras.map(camera => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${camera.id.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!error ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={paused || captureBusy}
              onClick={() => void handleManualCapture()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Camera size={14} className="text-[#0b5ea2] dark:text-[#93c5fd]" aria-hidden="true" />
              {captureBusy ? 'Reading frame…' : 'Scan current frame now'}
            </button>

            <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)]">
              <ImageUp size={14} className="text-[#0b5ea2] dark:text-[#93c5fd]" aria-hidden="true" />
              <span>Scan barcode image</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={paused || captureBusy}
                onChange={event => void handleImageUpload(event)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[#0f172a]">
        <div
          id={viewportId}
          aria-label="Live camera preview"
          className="camera-preview min-h-64 w-full overflow-hidden bg-[#0f172a]"
        />
        <div id={helperViewportId} className="sr-only" aria-hidden="true" />

        {!error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#132a3f] px-3.5 py-2 text-xs text-white">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  paused
                    ? 'bg-[#fbbf24]'
                    : candidateCode
                      ? 'animate-pulse bg-[#38bdf8]'
                      : 'animate-pulse bg-[#4ade80]'
                }`}
                aria-hidden="true"
              />
              {paused ? (
                <span>Paused while you confirm the item&rsquo;s condition in the pop-up.</span>
              ) : candidateCode ? (
                <span className="font-medium">
                  Reading <strong className="font-mono text-[#FFF200]">{candidateCode}</strong> — hold steady…
                </span>
              ) : cooldownCode ? (
                <span>
                  Last read <strong className="font-mono">{cooldownCode}</strong> · Hold next label or click Scan again.
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <ScanBarcode size={14} aria-hidden="true" className="text-[#93c5fd]" />
                  <span>Live Code-128 scanner active · Auto + HD contrast assist</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {candidateCode && !paused ? (
                <button
                  type="button"
                  onClick={() => acceptImmediately(candidateCode)}
                  className="inline-flex items-center gap-1 rounded-[5px] bg-[#0b5ea2] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#094e87]"
                >
                  <Check size={12} aria-hidden="true" />
                  Use {candidateCode}
                </button>
              ) : null}
              {cooldownCode && !paused ? (
                <button
                  type="button"
                  onClick={resetCooldown}
                  className="inline-flex items-center gap-1 rounded-[5px] bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  Scan same code again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {captureFeedback ? (
        <div
          className={`rounded-[8px] border px-3 py-2 text-xs font-medium ${
            captureFeedback.tone === 'warn'
              ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.24)] dark:text-[#fcd34d]'
              : 'border-[var(--sl-info-border)] bg-[var(--sl-info-soft)] text-[var(--sl-text-header)]'
          }`}
        >
          {captureFeedback.text}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] p-3.5 text-sm text-[#991b1b] dark:border-[rgba(248,113,113,0.35)] dark:bg-[rgba(180,35,24,0.24)] dark:text-[#fca5a5]"
        >
          <p className="font-medium">{error}</p>
          <button
            type="button"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[6px] border border-[#fca5a5] bg-white px-3 text-xs font-semibold text-[#991b1b] hover:bg-[#fef2f2] dark:bg-transparent dark:text-[#fca5a5]"
            onClick={() => setAttempt(value => value + 1)}
          >
            <RefreshCw size={13} aria-hidden="true" />
            Try camera again
          </button>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--sl-text-secondary)]">
          Hold the copy label 20 to 30 cm from the camera, flat, with white space on both ends inside the guide.{' '}
          {paused
            ? 'Scanning is paused until you finish the pop-up.'
            : 'The code is read automatically — or click Scan current frame now if a phone screen has glare.'}
        </p>
      )}
    </div>
  )
}
