import { Download, QrCode, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { attendanceApi } from './attendance-api'

type Props = { variant: 'hero'; schoolId: string } | { variant?: 'standalone'; schoolId?: never }

export function DashboardQrPass({ variant = 'standalone', schoolId }: Props = {}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true, objectUrl = ''
    attendanceApi.passImage().then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } }).catch(() => { if (active) setError('Your QR could not be loaded. Open QR attendance to try again.') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [])
  if (variant === 'hero') return <>
    <button type="button" aria-label="Open your library QR" onClick={() => dialog.current?.showModal()} className="min-w-0 rounded-2xl bg-white/10 p-4 text-left text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-white/15">
      <span className="flex items-center gap-2 text-xs text-white/75"><QrCode size={14} aria-hidden="true"/>Your library QR</span>
      {url ? <img src={url} alt="Your permanent library QR code" className="library-qr-image mx-auto mt-2 size-24 rounded-lg p-1"/> : <span className="mt-3 block text-sm" role={error ? 'alert' : 'status'}>{error || 'Loading QR…'}</span>}
    </button>
    <dialog ref={dialog} aria-labelledby="dashboard-library-qr-title" className="library-qr-dialog m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-[#0b5ea2]/15 bg-white p-6 text-[#0b5ea2] shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm dark:border-white/15 dark:bg-[#22232e] dark:text-white">
      <div className="flex items-start justify-between gap-3"><h2 id="dashboard-library-qr-title" className="font-display text-xl font-bold">Your library QR</h2><button type="button" aria-label="Close QR" onClick={() => dialog.current?.close()} className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"><X size={18}/></button></div>
      <p className="mt-2 text-sm leading-6">Show this QR at the library entrance or service desk. Use the same code every visit.</p>
      {url ? <img src={url} alt="Your permanent library QR code" className="library-qr-image mx-auto mt-4 aspect-square w-72 max-w-full rounded-xl p-3"/> : <p className="mt-4 text-sm" role={error ? 'alert' : 'status'}>{error || 'Loading QR…'}</p>}
      {url && error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
      <button type="button" disabled={!url || downloading} onClick={async () => { if (!schoolId) return; setError(''); setDownloading(true); try { await attendanceApi.downloadPass(schoolId) } catch { setError('Unable to download your QR code.') } finally { setDownloading(false) } }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5ea2] px-3 text-sm font-bold text-white disabled:opacity-50"><Download size={16}/>{downloading ? 'Preparing image…' : 'Download QR code'}</button>
    </dialog>
  </>
  return <section aria-label="Your permanent library QR" className="mb-5 flex flex-wrap items-center gap-5 rounded-2xl border bg-white p-5 text-[#0b5ea2] dark:bg-[#22232e] dark:text-white"><div className="min-w-0 flex-1"><h2 className="text-xl font-bold">Your permanent library QR</h2><p className="mt-2 max-w-xl text-sm">Show this QR at the library entrance or service desk. Use the same code every visit.</p>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</div>{url ? <img className="size-44 rounded-xl bg-white p-2" src={url} alt="Your permanent library QR code" /> : !error ? <p role="status">Loading QR…</p> : null}</section>
}
