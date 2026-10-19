import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { KioskScanner } from './KioskScanner'
import { deskCirculationApi, type DeskBorrower, type DeskCopy } from '../circulation/desk-circulation-api'
import { STRINGS, type Lang } from './i18n'
import { blockMessageFor, kioskSessionAlive } from './kiosk-session'

const MODE = 'TakeHome'
// The desk API exposes only the request's label, so match the server's requestLabels.ready_for_pickup.
const READY_FOR_PICKUP = 'Ready for pickup'

type Pickup = NonNullable<DeskBorrower['requests']>[number]

/** Account photo beside the name; hidden when missing or when the short-lived URL fails. */
function BorrowerName({ user }: { user: DeskBorrower['user'] }) {
  const [photoOk, setPhotoOk] = useState(true)
  return (
    <p className="kiosk-borrower">
      {user.photoUrl && photoOk && <img src={user.photoUrl} alt={user.name} className="kiosk-photo" onError={() => setPhotoOk(false)} />}
      <span>{user.name}</span>
    </p>
  )
}

type Result = { title?: string; copy?: { title: string }; dueAt?: string }

export function BorrowFlow({ lang, onDone, onSessionLost }: { lang: Lang; onDone: () => void; onSessionLost: () => void }) {
  const t = STRINGS[lang]
  const [payload, setPayload] = useState('')
  const [barcode, setBarcode] = useState('')
  const [borrower, setBorrower] = useState<DeskBorrower | null>(null)
  // Chosen reservation to pick up; 'other' = the student chose a different book.
  const [pickup, setPickup] = useState<Pickup | 'other' | null>(null)
  const [copy, setCopy] = useState<DeskCopy | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [blockers, setBlockers] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The scanner emits once per mount; a new key gives the student a fresh scanner to retry.
  const [attempt, setAttempt] = useState(0)

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setBlockers('')
    try { await work() } catch (err) {
      if (!(await kioskSessionAlive())) { onSessionLost(); return }
      setError(blockMessageFor(err, lang)); setAttempt(a => a + 1)
    } finally { setBusy(false) }
  }

  const identify = (code: string) => run(async () => {
    const found = await deskCirculationApi.borrower(code, MODE)
    setPayload(code)
    if (!found.eligible) { setBlockers(found.blockers.join(' ')); return }
    setBorrower(found)
  })

  const readyPickups = borrower?.requests?.filter(r => r.statusLabel === READY_FOR_PICKUP && r.barcode) ?? []
  const reservationId = pickup && pickup !== 'other' ? pickup.reservationId : undefined

  const scanCopy = (code: string) => run(async () => {
    const preview = await deskCirculationApi.preview(payload, code, MODE, reservationId)
    setBarcode(code)
    if (!preview.eligible) { setCopy(preview); setBlockers(preview.blockers.join(' ')); return }
    setCopy(preview)
  })

  const confirm = () => run(async () => {
    setResult(await deskCirculationApi.checkout(payload, barcode, MODE, crypto.randomUUID(), reservationId))
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
        <BorrowerName user={borrower.user} />
        <p>{copy.copy.title}</p>
        {error && <p role="alert">{error}</p>}
        <Button onClick={confirm} disabled={busy}>{t.confirmBorrow}</Button>
      </SectionCard>
    )
  }

  if (borrower && readyPickups.length && !pickup) {
    return (
      <SectionCard>
        <h2>{t.pickupTitle}</h2>
        <BorrowerName user={borrower.user} />
        <p>{t.pickupHint}</p>
        <div className="flex flex-col gap-3 my-4">
          {readyPickups.map(r => (
            <Button key={r.reservationId} className="kiosk-big" onClick={() => setPickup(r)}>
              <span>{r.title}{r.shelfLocation && <span className="block font-normal">{r.shelfLocation}</span>}</span>
            </Button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setPickup('other')}>{t.borrowOther}</Button>
      </SectionCard>
    )
  }

  if (borrower) {
    return (
      <SectionCard>
        <h2>{t.borrow}</h2>
        <BorrowerName user={borrower.user} />
        {pickup && pickup !== 'other' && <p className="font-bold">{pickup.title}</p>}
        {pickup && pickup !== 'other' && pickup.shelfLocation && <p>{pickup.shelfLocation}</p>}
        <KioskScanner key={`book-${attempt}`} label={t.scanBook} onScan={scanCopy} lang={lang} />
        {error && <p role="alert">{error}</p>}
      </SectionCard>
    )
  }

  return (
    <SectionCard>
      <h2>{t.borrow}</h2>
      <KioskScanner key={`qr-${attempt}`} qr label={t.scanQr} onScan={identify} lang={lang} />
      {error && <p role="alert">{error}</p>}
    </SectionCard>
  )
}
