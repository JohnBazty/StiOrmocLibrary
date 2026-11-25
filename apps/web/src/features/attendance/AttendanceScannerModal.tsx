import type { Html5Qrcode as Html5QrcodeInstance } from 'html5-qrcode'
import { AlertCircle, Camera, CheckCircle2, Clock3, QrCode, ScanLine, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { qrScanBox } from '../../components/scanner-viewport'
import { Button, NoticeBanner } from '../../components/ui'
import { attendanceApi, type AttendanceConfirmationRequest } from './attendance-api'
import { notifyAttendanceUpdated } from './attendance-updates'

const readerId = 'smartlib-attendance-qr-reader'
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Attendance could not be checked. Try again.'

export function AttendanceScannerModal({
  open,
  onClose,
  onRecorded,
}: {
  open: boolean
  onClose: () => void
  onRecorded?: () => void
}) {
  const scanner = useRef<Html5QrcodeInstance | null>(null)
  const handling = useRef(false)
  const saving = useRef(false)
  const cameraOpening = useRef(false)
  const openRef = useRef(open)
  const generation = useRef(0)
  openRef.current = open
  const requestKey = useRef({ payload: '', id: '' })
  const recorded = useRef('')
  const mounted = useRef(false)
  const callback = useRef(onRecorded)
  callback.current = onRecorded

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [typed, setTyped] = useState('')
  const [scan, setScan] = useState<AttendanceConfirmationRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const stop = useCallback(async () => {
    const instance = scanner.current
    if (!instance) return
    try {
      if (instance.isScanning) await instance.stop()
      await instance.clear()
    } catch {
      /* The camera may already have been released. */
    } finally {
      scanner.current = null
      if (mounted.current) setScanning(false)
    }
  }, [])

  const reset = useCallback(async () => {
    generation.current++
    await stop()
    handling.current = false
    requestKey.current = { payload: '', id: '' }
    setImageFile(null)
    setTyped('')
    setScan(null)
    setError('')
    setBusy(false)
  }, [stop])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void stop()
    }
  }, [stop])

  useEffect(() => {
    if (!open) void reset()
    return () => {
      void stop()
    }
  }, [open, reset, stop])

  function apply(next: AttendanceConfirmationRequest) {
    setScan(next)
    if (next.state === 'Confirmed' && recorded.current !== next.confirmationId) {
      recorded.current = next.confirmationId
      callback.current?.()
      notifyAttendanceUpdated()
    }
  }

  const resolve = async (value: string) => {
    const payload = value.trim()
    if (!payload || handling.current || saving.current) return
    const version = generation.current
    handling.current = true
    setBusy(true)
    setError('')
    if (requestKey.current.payload !== payload) {
      requestKey.current = { payload, id: crypto.randomUUID() }
    }
    try {
      await stop()
      const next = await attendanceApi.sendConfirmation(payload, requestKey.current.id)
      if (mounted.current && openRef.current && version === generation.current) apply(next)
    } catch (reason) {
      if (mounted.current) setError(message(reason))
      handling.current = false
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (!open || scan?.state !== 'Pending') return
    let active = true
    let running = false
    const refresh = async () => {
      if (!active || running || saving.current || document.hidden) return
      running = true
      try {
        const next = await attendanceApi.scanConfirmation(scan.confirmationId)
        if (active) {
          apply(next)
          setError('')
        }
      } catch (reason) {
        if (active) setError(message(reason))
      } finally {
        running = false
      }
    }
    const timer = setInterval(() => void refresh(), 2000)
    const returned = () => void refresh()
    window.addEventListener('focus', returned)
    document.addEventListener('visibilitychange', returned)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', returned)
      document.removeEventListener('visibilitychange', returned)
    }
  }, [open, scan?.confirmationId, scan?.state])

  const start = async () => {
    if (cameraOpening.current) return
    cameraOpening.current = true
    await reset()
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      const cameras = await Html5Qrcode.getCameras()
      if (!openRef.current || !mounted.current) return
      if (!cameras.length) {
        throw new Error('No camera was found. Use a USB scanner or a saved QR image.')
      }
      const instance = new Html5Qrcode(readerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      })
      scanner.current = instance
      setScanning(true)
      const preferred =
        cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[0]
      await instance.start(
        preferred.id,
        { fps: 10, aspectRatio: 4 / 3, qrbox: qrScanBox },
        (decoded) => void resolve(decoded),
        () => undefined,
      )
      if (!openRef.current) await stop()
      else document.getElementById(readerId)?.scrollIntoView?.({ block: 'nearest' })
    } catch (reason) {
      await stop()
      if (mounted.current) setError(message(reason))
    } finally {
      cameraOpening.current = false
    }
  }

  const readImage = async () => {
    if (!imageFile || busy) return
    setBusy(true)
    setError('')
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      const instance = new Html5Qrcode(readerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      })
      scanner.current = instance
      const decoded = await instance.scanFile(imageFile, true)
      await resolve(decoded)
    } catch (reason) {
      setError(message(reason))
      handling.current = false
    } finally {
      setBusy(false)
      await stop()
    }
  }

  async function cancel() {
    if (!scan || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      apply(await attendanceApi.cancelScanConfirmation(scan.confirmationId))
    } catch (reason) {
      setError(message(reason))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  if (!open) return null

  const done = scan?.state === 'Confirmed'
  const isPending = scan?.state === 'Pending'
  const statusCardClass = done
    ? 'border-[#16a34a]/35 bg-[#dcfce7]/60 text-[#166534] dark:border-[#16a34a]/40 dark:bg-[#166534]/20 dark:text-[#86efac]'
    : isPending
      ? 'border-[#eab308]/45 bg-[#fef9c3]/70 text-[#92400e] dark:border-[#eab308]/40 dark:bg-[#854d0e]/25 dark:text-[#fde047]'
      : 'border-[#dc2626]/35 bg-[#fee2e2]/65 text-[#b42318] dark:border-[#dc2626]/40 dark:bg-[#991b1b]/25 dark:text-[#fca5a5]'

  return (
    <div
      className="sl-backdrop-in fixed inset-0 z-[80] flex items-center justify-center bg-[#132a3f]/65 p-2.5 backdrop-blur-[3px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-scanner-heading"
    >
      <div className="sl-book-modal-in max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[16px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0b5ea2] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--sl-border)] bg-gradient-to-r from-[#f0f7ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] px-5 py-4 dark:from-[#16253b] dark:via-[#1a2232] dark:to-[#24251c] sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#0f766e]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                <ScanLine size={12} />
                Library entrance
              </span>
              {!scan ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    scanning
                      ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]'
                      : 'bg-[var(--sl-bg-subtle)] text-[var(--sl-text-secondary)]'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      scanning ? 'animate-pulse bg-[#16a34a]' : 'bg-[var(--sl-text-muted)]'
                    }`}
                  />
                  {scanning ? 'Camera live' : 'Camera standby'}
                </span>
              ) : null}
            </div>
            <h2
              id="attendance-scanner-heading"
              className="mt-1.5 font-display text-xl font-bold text-[var(--sl-text-header)]"
            >
              Scan attendance QR
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close attendance scanner"
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--sl-border-strong)] text-[var(--sl-text-secondary)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-pretty text-sm leading-6 text-[var(--sl-text-secondary)]">
            Scan the visitor’s QR. They choose their purpose and confirm entry or exit on their own signed-in account.
          </p>

          {scan ? (
            <section
              aria-live="polite"
              className={`space-y-4 rounded-[12px] border p-5 ${statusCardClass}`}
            >
              <div className="flex items-start gap-3">
                {done ? (
                  <CheckCircle2 size={24} className="mt-0.5 shrink-0" />
                ) : isPending ? (
                  <Clock3 size={24} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle size={24} className="mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold">{scan.visitor.name}</h3>
                  <p className="text-xs font-medium opacity-85">
                    {scan.visitor.schoolId} · {scan.visitor.role}
                  </p>
                </div>
              </div>

              <h3 className="font-display text-lg font-bold">
                {done
                  ? scan.result?.message
                  : isPending
                    ? scan.action === 'Exit'
                      ? 'Waiting for user to confirm exit'
                      : 'Waiting for user to choose a purpose'
                    : scan.state === 'Expired'
                      ? 'Scan expired'
                      : scan.state === 'Cancelled'
                        ? 'Request cancelled'
                        : 'Scan again'}
              </h3>

              {isPending ? (
                <div className="space-y-1 text-sm opacity-90">
                  <p className="leading-6">
                    Ask the visitor to open their library account. The confirmation appears automatically. Attendance is recorded after they confirm.
                  </p>
                  <p className="text-xs font-semibold opacity-80">
                    Expires at{' '}
                    {new Date(scan.expiresAt).toLocaleTimeString('en-PH', {
                      timeZone: 'Asia/Manila',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ) : null}

              {done ? (
                <p className="text-sm font-semibold tabular-nums">
                  Occupied seats: {scan.occupancy.current} / {scan.occupancy.capacity}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {isPending ? (
                  <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>
                    Cancel request
                  </Button>
                ) : null}
                <Button disabled={busy} onClick={() => void reset()}>
                  Scan another visitor
                </Button>
              </div>
            </section>
          ) : (
            <>
              {/* Guided Camera Viewfinder Card */}
              <div className="overflow-hidden rounded-[12px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40">
                <div className="relative bg-gradient-to-br from-[#0f1f30] via-[#132a3f] to-[#0b3c69]">
                  <div
                    id={readerId}
                    aria-label="Attendance camera preview"
                    className={`camera-preview w-full ${scanning ? 'min-h-64 sm:min-h-80' : 'min-h-[196px]'}`}
                  />
                  {!scanning ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white"
                    >
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-[14px] bg-white/8 ring-1 ring-white/15">
                        <span className="absolute left-0 top-0 h-4 w-4 rounded-tl-[8px] border-l-[3px] border-t-[3px] border-[#FFF200]" />
                        <span className="absolute right-0 top-0 h-4 w-4 rounded-tr-[8px] border-r-[3px] border-t-[3px] border-[#FFF200]" />
                        <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl-[8px] border-b-[3px] border-l-[3px] border-[#FFF200]" />
                        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-br-[8px] border-b-[3px] border-r-[3px] border-[#FFF200]" />
                        <QrCode size={38} className="text-white/85" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">Camera preview ready</p>
                      <p className="mt-0.5 max-w-sm text-xs text-white/75">
                        Click Start camera to scan a visitor’s QR pass, upload a saved QR image, or use a USB scanner below.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2.5 border-t border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3.5 sm:grid-cols-2">
                  <Button
                    variant={scanning ? 'danger' : 'primary'}
                    onClick={() => void (scanning ? stop() : start())}
                    disabled={busy}
                  >
                    <Camera size={16} />
                    {scanning ? 'Stop camera' : 'Start camera'}
                  </Button>
                  <label className="relative inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)]">
                    <Upload size={16} />
                    Choose saved image
                    <input
                      aria-label="Saved QR image"
                      disabled={busy}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        setImageFile(event.target.files?.[0] ?? null)
                        setError('')
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>

              <SelectedFilePreview
                file={imageFile}
                disabled={busy}
                onRemove={() => {
                  setImageFile(null)
                  setError('')
                }}
              />
              {imageFile ? (
                <Button disabled={busy} onClick={() => void readImage()}>
                  {busy ? 'Reading image…' : 'Read QR from image'}
                </Button>
              ) : null}

              {/* Clean Divider + Horizontal USB Reader / Manual Input Bar */}
              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t border-[var(--sl-border)]" />
                <span className="px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sl-text-muted)]">
                  Or use USB scanner / paste code
                </span>
                <div className="flex-1 border-t border-[var(--sl-border)]" />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void resolve(typed)
                }}
                className="space-y-1.5"
              >
                <label className="block text-xs font-semibold text-[var(--sl-text-header)]" htmlFor="attendance-qr-input">
                  Visitor QR
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="attendance-qr-input"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={typed}
                    disabled={busy || scanning}
                    onChange={(event) => setTyped(event.target.value)}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData('text').trim()
                      if (!text) return
                      event.preventDefault()
                      setTyped(text)
                      void resolve(text)
                    }}
                    placeholder="Scan with USB reader or paste QR"
                    className="sl-input min-h-[42px] flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={busy || scanning || !typed.trim()}
                    className="sm:shrink-0"
                  >
                    {busy ? 'Sending…' : 'Send to visitor'}
                  </Button>
                </div>
              </form>
            </>
          )}

          {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
        </div>
      </div>
    </div>
  )
}
