import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { KioskScanner } from './KioskScanner'
import { attendanceApi, type ScanResult } from '../attendance/attendance-api'
import { STRINGS, type Lang } from './i18n'
import { blockMessageFor } from './kiosk-session'

const DEFAULT_PURPOSE = 'Library Visit'

type Resolved = { payload: string; scan: ScanResult }

export function AttendanceFlow({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const t = STRINGS[lang]
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const resolve = async (code: string) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      setResolved({ payload: code, scan: await attendanceApi.resolveScan(code) })
    } catch (err) {
      setError(blockMessageFor(err, lang))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (busy || !resolved) return
    setBusy(true); setError('')
    try {
      const confirmation = resolved.scan.openVisit
        ? await attendanceApi.checkOut(resolved.payload)
        : await attendanceApi.checkIn(resolved.payload, DEFAULT_PURPOSE, crypto.randomUUID())
      setMessage(confirmation.message)
    } catch (err) {
      setError(blockMessageFor(err, lang))
    } finally {
      setBusy(false)
    }
  }

  if (message) {
    return (
      <SectionCard>
        <h2>{t.attendance}</h2>
        <p role="status">{message}</p>
        <Button onClick={onDone}>{t.done}</Button>
      </SectionCard>
    )
  }

  if (resolved) {
    const exiting = resolved.scan.openVisit !== null
    return (
      <SectionCard>
        <h2>{t.attendance}</h2>
        <p>{resolved.scan.visitor.name}</p>
        {error && <p role="alert">{error}</p>}
        <Button onClick={confirm} disabled={busy}>{exiting ? t.confirmExit : t.confirmEntry}</Button>
      </SectionCard>
    )
  }

  return (
    <SectionCard>
      <h2>{t.attendance}</h2>
      <KioskScanner qr label={t.scanQr} onScan={resolve} lang={lang} />
      {error && <p role="alert">{error}</p>}
    </SectionCard>
  )
}
