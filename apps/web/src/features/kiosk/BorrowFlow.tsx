import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { KioskScanner } from './KioskScanner'
import { deskCirculationApi, type DeskBorrower, type DeskCopy } from '../circulation/desk-circulation-api'
import { STRINGS, type Lang } from './i18n'
import { blockMessageFor } from './kiosk-session'

const MODE = 'TakeHome'

type Result = { title?: string; copy?: { title: string }; dueAt?: string }

export function BorrowFlow({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const t = STRINGS[lang]
  const [payload, setPayload] = useState('')
  const [barcode, setBarcode] = useState('')
  const [borrower, setBorrower] = useState<DeskBorrower | null>(null)
  const [copy, setCopy] = useState<DeskCopy | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [blockers, setBlockers] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setBlockers('')
    try { await work() } catch (err) { setError(blockMessageFor(err, lang)) } finally { setBusy(false) }
  }

  const identify = (code: string) => run(async () => {
    const found = await deskCirculationApi.borrower(code, MODE)
    setPayload(code)
    if (!found.eligible) { setBlockers(found.blockers.join(' ')); return }
    setBorrower(found)
  })

  const scanCopy = (code: string) => run(async () => {
    const preview = await deskCirculationApi.preview(payload, code, MODE)
    setBarcode(code)
    if (!preview.eligible) { setCopy(preview); setBlockers(preview.blockers.join(' ')); return }
    setCopy(preview)
  })

  const confirm = () => run(async () => {
    setResult(await deskCirculationApi.checkout(payload, barcode, MODE, crypto.randomUUID()))
  })

  if (result) {
    const title = result.title ?? result.copy?.title ?? ''
    return (
      <SectionCard>
        <h2>{t.borrow}</h2>
        <p role="status">{t.borrowed}: {title}</p>
        {result.dueAt && <p>{t.due}: {result.dueAt}</p>}
        <Button onClick={onDone}>{t.done}</Button>
      </SectionCard>
    )
  }

  if (blockers) {
    return (
      <SectionCard>
        <h2>{t.cannotBorrow}</h2>
        <p role="alert">{blockers}</p>
        <Button onClick={onDone}>{t.done}</Button>
      </SectionCard>
    )
  }

  if (borrower && copy?.eligible) {
    return (
      <SectionCard>
        <h2>{t.borrow}</h2>
        <p>{borrower.user.name}</p>
        <p>{copy.copy.title}</p>
        {error && <p role="alert">{error}</p>}
        <Button onClick={confirm} disabled={busy}>{t.confirmBorrow}</Button>
      </SectionCard>
    )
  }

  if (borrower) {
    return (
      <SectionCard>
        <h2>{t.borrow}</h2>
        <p>{borrower.user.name}</p>
        <KioskScanner label={t.scanBook} onScan={scanCopy} lang={lang} />
        {error && <p role="alert">{error}</p>}
      </SectionCard>
    )
  }

  return (
    <SectionCard>
      <h2>{t.borrow}</h2>
      <KioskScanner qr label={t.scanQr} onScan={identify} lang={lang} />
      {error && <p role="alert">{error}</p>}
    </SectionCard>
  )
}
