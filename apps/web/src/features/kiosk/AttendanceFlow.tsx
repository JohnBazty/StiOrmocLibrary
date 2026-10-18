import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { KioskScanner } from './KioskScanner'
import { attendanceApi, type ScanResult } from '../attendance/attendance-api'
import { STRINGS, type Lang } from './i18n'
import { blockMessageFor, kioskSessionAlive } from './kiosk-session'

const DEFAULT_PURPOSE = 'Library Visit'

type Resolved = { payload: string; scan: ScanResult }

export function AttendanceFlow({ lang, onDone, onSessionLost }: { lang: Lang; onDone: () => void; onSessionLost: () => void }) {
  const t = STRINGS[lang]
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The scanner emits once per mount; a new key gives the student a fresh scanner to retry.
  const [attempt, setAttempt] = useState(0)

  const resolve = async (code: string) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      setResolved({ payload: code, scan: await attendanceApi.resolveScan(code) })
    } catch (err) {
      if (!(await kioskSessionAlive())) { onSessionLost(); return }
      setError(blockMessageFor(err, lang))
      setAttempt(a => a + 1)
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
      if (!(await kioskSessionAlive())) { onSessionLost(); return }
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
      <KioskScanner key={attempt} qr label={t.scanQr} onScan={resolve} lang={lang} />
      {error && <p role="alert">{error}</p>}
    </SectionCard>
  )
}
