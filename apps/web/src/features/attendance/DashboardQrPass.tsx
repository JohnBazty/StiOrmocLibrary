import { ArrowUpRight, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { attendanceApi } from './attendance-api'

interface DashboardQrPassProps {
  schoolId?: string
  role?: string
  attendancePath?: string
}

export function DashboardQrPass({ schoolId, role, attendancePath }: DashboardQrPassProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    attendanceApi
      .passImage()
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => {
        if (active) setError('Your QR could not be loaded. Open QR attendance to try again.')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  return (
    <section
      aria-label="Your permanent library QR"
      className="relative overflow-hidden rounded-[12px] border border-[#1d3f5e] bg-gradient-to-br from-[#132a3f] via-[#0b5ea2] to-[#0f766e] p-5 text-white shadow-[var(--sl-shadow-m)]"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[#FFF200]" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFF200]">
            <QrCode size={13} />
            Entrance &amp; desk pass
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-white">
            Your permanent library QR
          </h2>
        </div>
        {role ? (
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/20">
            {role}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col items-center rounded-[10px] bg-white p-3.5 text-center shadow-inner">
        {url ? (
          <img
            className="size-36 rounded-[6px]"
            src={url}
            alt="Your permanent library QR code"
            width={144}
            height={144}
          />
        ) : !error ? (
          <p role="status" className="py-12 text-xs font-medium text-[#556987]">
            Loading QR…
          </p>
        ) : (
          <p role="alert" className="rounded-[8px] bg-[#fee2e2] px-3 py-2 text-xs font-medium text-[#991b1b]">
            {error}
          </p>
        )}
        {schoolId ? (
          <p className="mt-2 font-mono text-xs font-semibold tracking-wider text-[#132a3f]">
            ID · {schoolId}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-5 text-white/80">
        Show this QR at the library entrance or service desk. Use the same code every visit.
      </p>

      {attendancePath ? (
        <Link
          to={attendancePath}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#FFF200] transition-opacity hover:opacity-85"
        >
          Open QR attendance
          <ArrowUpRight size={14} />
        </Link>
      ) : null}
    </section>
  )
}
