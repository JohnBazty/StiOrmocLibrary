import { useEffect, useState } from 'react'
import { attendanceApi } from './attendance-api'

export function DashboardQrPass() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, objectUrl = ''
    attendanceApi.passImage().then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } }).catch(() => { if (active) setError('Your QR could not be loaded. Open QR attendance to try again.') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [])
  return <section aria-label="Your permanent library QR" className="mb-5 flex flex-wrap items-center gap-5 rounded-2xl border bg-white p-5 text-[#003399] dark:bg-[#001a4d] dark:text-white"><div className="min-w-0 flex-1"><h2 className="text-xl font-bold">Your permanent library QR</h2><p className="mt-2 max-w-xl text-sm">Show this QR at the library entrance or service desk. Use the same code every visit.</p>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</div>{url ? <img className="size-44 rounded-xl bg-white p-2" src={url} alt="Your permanent library QR code" /> : !error ? <p role="status">Loading QR…</p> : null}</section>
}
