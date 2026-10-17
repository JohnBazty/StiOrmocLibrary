import { BookOpen, CheckCircle2, RotateCcw, UserRound } from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, SectionCard } from '../../components/ui'

import { deskCirculationApi, type DeskMode, type DeskBorrower, type DeskCopy, type InLibraryUse, type PickupSelection } from './desk-circulation-api'

import { DeskScanInput } from './DeskScanInput'

import { CirculationReturnDialog } from './CirculationReturnDialog'

import { attendanceApi, type OperationalState } from '../attendance/attendance-api'

const when = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

export function CirculationDesk({ onChanged, returnBarcode, borrowerRequest, onBusyChange }: {

  onChanged: () => void

  returnBarcode?: { value: string; key: number }

  borrowerRequest?: PickupSelection & { key: number }

  onBusyChange?: (busy: boolean) => void

}) {

  const [mode, setMode] = useState<DeskMode>('TakeHome')

  const [payload, setPayload] = useState('')

  const [barcode, setBarcode] = useState('')

  const [borrower, setBorrower] = useState<DeskBorrower | null>(null)

  const [copy, setCopy] = useState<DeskCopy | null>(null)

  const [uses, setUses] = useState<InLibraryUse[]>([])

  const [listError, setListError] = useState('')

  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')

  const [success, setSuccess] = useState('')

  const [pickupContext, setPickupContext] = useState<PickupSelection | null>(null)

  const [selectedRequest, setSelectedRequest] = useState<number | null>(null)

  const [returnTarget, setReturnTarget] = useState<{ value: string; key: number } | null>(null)

  const [focusBorrower, setFocusBorrower] = useState<number | undefined>()

  const key = useRef('')

  const saving = useRef(false)

  const heading = useRef<HTMLHeadingElement>(null)

  const [scanFocus, setScanFocus] = useState(0)

  const [entryState, setEntryState] = useState<OperationalState | null>(null)

  const [entryError, setEntryError] = useState('')

  const [entryAttempt, setEntryAttempt] = useState(0)

  const attendanceKey = useRef('')

  const activity = useRef(0)

  const load = useCallback(async () => {

    try { setUses(await deskCirculationApi.uses()); setListError('') }

    catch (reason) { setListError(reason instanceof Error ? reason.message : 'In-library records unavailable.') }

  }, [])

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer) }, [load])

  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  function reset() {

    setPickupContext(null); setSelectedRequest(null); setPayload(''); setBarcode(''); setBorrower(null); setCopy(null); setError(''); setEntryState(null); setEntryError(''); key.current = ''; attendanceKey.current = ''; activity.current = 0

  }

  useEffect(() => { if (returnBarcode) setReturnTarget(returnBarcode) }, [returnBarcode?.key])

  async function loadPickup(selection: PickupSelection) {

    if (saving.current) return

    saving.current = true; setBusy(true); reset(); setPickupContext(selection); setMode('TakeHome'); setSuccess('')

    try {

      const result = await deskCirculationApi.requestPreview(selection)

      setBorrower(result.borrower); setCopy(result.preview); setBarcode(result.barcode); setSelectedRequest(result.reservationId)

      key.current = crypto.randomUUID(); activity.current = Date.now()

      heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); heading.current?.focus()

    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pickup details could not be loaded. Refresh this pickup.') }

    finally { saving.current = false; setBusy(false) }

  }

  useEffect(() => {

    if (borrowerRequest) void loadPickup(borrowerRequest.reservationId ? {reservationId:borrowerRequest.reservationId} : {transactionId:borrowerRequest.transactionId})

  }, [borrowerRequest?.key])

  async function verifyUser(value: string, useMode: DeskMode = mode) {

    if (saving.current || !value.trim()) return

    setSelectedRequest(null); saving.current = true; setBusy(true); setError(''); setSuccess(''); setBorrower(null); setCopy(null); key.current = ''

    try { setBorrower(await deskCirculationApi.borrower(value, useMode)); setPayload(value); attendanceKey.current = crypto.randomUUID(); activity.current = Date.now(); setScanFocus(value => value + 1) }

    catch (reason) { setError(reason instanceof Error ? reason.message : 'The borrower could not be found.') }

    finally { saving.current = false; setBusy(false) }

  }

  async function verifyCopy(value: string) {

    if (saving.current || !value.trim()) return

    saving.current = true; setBusy(true); setError(''); setSuccess(''); setCopy(null); key.current = ''

    try {

      setBarcode(value)

      if (Date.now() - activity.current > 5 * 60_000) { reset(); setFocusBorrower(Date.now()); throw new Error('Please scan the borrower again after five minutes of inactivity.') }

      const request = mode === 'TakeHome' ? borrower?.requests?.find(request => ['Ready for pickup','Awaiting handover'].includes(request.statusLabel) && request.barcode?.trim().toUpperCase() === value.trim().toUpperCase()) : undefined

      const requestId = request?.reservationId ?? null

      setSelectedRequest(requestId)

      setCopy(await deskCirculationApi.preview(payload, value, mode, requestId))

      activity.current = Date.now()

      key.current = crypto.randomUUID()

    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The book could not be verified.') }

    finally { saving.current = false; setBusy(false) }

  }

  async function confirm() {

    if (saving.current || !key.current || !copy?.eligible || !borrower?.eligible) return

    saving.current = true; setBusy(true); setError('')

    try {

      const result = pickupContext ? await deskCirculationApi.checkoutRequest(pickupContext, barcode, copy.copy.id, key.current) : await deskCirculationApi.checkout(payload, barcode, mode, key.current, selectedRequest)

      const title = result.copy?.title ?? result.title ?? 'Material'

      setSuccess(mode === 'InLibrary' ? `${title} assigned for in-library use. Hand back by ${when(result.handBackBy!)}.` : `${title} checked out. Due ${when(result.dueAt!)}.`)

      setCopy(null); setBarcode(''); setSelectedRequest(null); key.current = ''; onChanged(); void load()

      if (pickupContext) { reset(); return }

      try {

        const updated = await deskCirculationApi.borrower(payload, mode)

        if (updated.user.userId !== borrower.user.userId) throw new Error('Borrower identity changed.')

        setBorrower(updated); activity.current = Date.now(); setScanFocus(value => value + 1)

      } catch {

        setBorrower(null); setPayload(''); attendanceKey.current = ''; activity.current = 0

        setError('Checkout was saved. Scan the borrower again before lending another book.'); setFocusBorrower(Date.now())

      }

    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Confirmation failed. You may retry the same transaction.') }

    finally { saving.current = false; setBusy(false) }

  }

  useEffect(() => {

    if (!payload || !borrower || borrower.hasAttendance !== false) return

    let active = true

    setEntryState(null); setEntryError('')

    attendanceApi.state().then(result => { if (active) setEntryState(result) })

      .catch(reason => { if (active) setEntryError(reason instanceof Error ? reason.message : 'Entry availability could not be checked.') })

    return () => { active = false }

  }, [borrower?.user.userId, borrower?.hasAttendance, entryAttempt])

  useEffect(() => {

    const timer = setInterval(() => {

      if (!saving.current && activity.current && Date.now() - activity.current > 5 * 60_000) {

        reset(); setFocusBorrower(Date.now())

      }

    }, 15000)

    return () => clearInterval(timer)

  }, [])

  async function checkInHere() {

    if (saving.current || !payload || !borrower || borrower.hasAttendance !== false || !entryState?.entryOpen || !entryState.allowBorrowing || entryState.available <= 0) return

    saving.current = true; setBusy(true); setError('')

    if (!attendanceKey.current) attendanceKey.current = crypto.randomUUID()

    try {

      await attendanceApi.scan(payload, 'Book Borrowing', attendanceKey.current, 'Entry')

      const updated = await deskCirculationApi.borrower(payload, mode)

      if (updated.user.userId !== borrower.user.userId) throw new Error('Please rescan the borrower.')

      setBorrower(updated); activity.current = Date.now(); setScanFocus(value => value + 1)

      setSuccess(updated.eligible ? 'Attendance recorded. Scan the book to continue.' : 'Attendance recorded. Resolve the borrowing restrictions before checkout.')

    } catch (reason) {

      setError(reason instanceof Error ? reason.message : 'Check-in could not be recorded. Retry with the same QR.')

      setEntryAttempt(value => value + 1)

    } finally { saving.current = false; setBusy(false) }

  }

  const visibleBlockers = borrower?.blockers.filter(blocker => !payload || borrower.hasAttendance !== false || blocker !== 'Check in at the library entrance before borrowing.') ?? []

  const entryAllowed = Boolean(entryState?.entryOpen && entryState.allowBorrowing && entryState.available > 0)

  return <>

    <SectionCard className="mb-6 overflow-hidden">

      <div className="border-b border-[#0b5ea2]/10 p-5 sm:p-6 dark:border-white/10">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <div><h2 ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">Library counter</h2><p className="mt-1 text-sm opacity-60">{pickupContext ? 'Borrower and assigned copy loaded. Review, then confirm handover.' : 'Scan, check the details, and confirm.'}</p></div>

          <div className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-[#0b5ea2]/5 p-1 sm:w-auto dark:bg-white/10" role="group" aria-label="Counter task">

            {(['TakeHome', 'Return'] as const).map(task => <button key={task} type="button" aria-pressed={task === 'Return' ? mode === 'Return' : mode !== 'Return'} disabled={busy} onClick={() => { reset(); setSuccess(''); setMode(task) }} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-40 ${(task === 'Return' ? mode === 'Return' : mode !== 'Return') ? 'bg-[#0b5ea2] text-white shadow-sm' : 'hover:bg-white/60 dark:hover:bg-white/10'}`}>{task === 'Return' ? <RotateCcw size={17} /> : <BookOpen size={17} />}{task === 'Return' ? 'Return' : 'Borrow'}</button>)}

          </div>

        </div>

      </div>

      <div className="p-5 sm:p-6">

        {success ? <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl bg-[#FFF200] p-4 text-sm font-semibold text-[#0b5ea2]"><CheckCircle2 className="shrink-0" size={19} />{success}</div> : null}

        {error ? <p role="alert" className="auth-error mb-5 rounded-xl p-4 text-sm">{error}</p> : null}

        {mode === 'Return' ? <div className="mx-auto max-w-xl py-2"><h3 className="text-lg font-bold">Which book is being returned?</h3><p className="mb-5 mt-1 text-sm opacity-65">Scan its barcode, or select Return book from the loans below.</p><DeskScanInput key="return-book" autoSubmit focusRequest={scanFocus} label="Book barcode" value={barcode} disabled={busy} actionLabel="Look up" onChange={setBarcode} onScan={value => { if (value.trim()) setReturnTarget({ value, key: Date.now() }) }} /></div> : <>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm opacity-65">{pickupContext ? 'Check the name and assigned book below. No repeat scans needed.' : 'Scan borrower once → scan book → confirm.'}</p><label className="flex items-center gap-2 text-xs font-semibold">Use<select aria-label="Book use" disabled={busy || Boolean(pickupContext)} value={mode} onChange={event => { const nextMode = event.target.value as DeskMode; setMode(nextMode); setBarcode(''); setCopy(null); setSelectedRequest(null); key.current = ''; if (borrower) void verifyUser(payload, nextMode) }} className="rounded-lg border border-[#0b5ea2]/20 bg-white p-2 text-[#0b5ea2]"><option value="TakeHome">Take home</option><option value="InLibrary">Inside the library</option></select></label></div>

          {!borrower && pickupContext ? <div><p role="status" className="text-sm">{busy ? 'Loading borrower and assigned book…' : 'Pickup details are unavailable.'}</p><Button disabled={busy} variant="secondary" onClick={() => void loadPickup(pickupContext)}>Refresh pickup</Button></div> : !borrower ? <DeskScanInput key="borrower" autoSubmit qr label="Borrower QR" value={payload} disabled={busy} focusRequest={focusBorrower} actionLabel={busy ? 'Checking…' : 'Look up'} onChange={setPayload} onScan={value => void verifyUser(value)} /> : <>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#0b5ea2]/15 p-4 dark:border-white/15">

              {borrower.user.photoUrl ? <img src={borrower.user.photoUrl} alt="Approved profile photo" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0b5ea2]/5 dark:bg-white/10"><UserRound size={22} /></span>}

              <div className="min-w-0 flex-1"><p className="break-words font-bold">{borrower.user.name}</p><p className="break-words text-xs opacity-65">{borrower.user.schoolId} · {borrower.user.role}</p><p className="mt-1 text-xs opacity-60">{borrower.enrollment}</p></div>

              <Button disabled={busy} variant="secondary" className="w-full sm:w-auto" onClick={() => { reset(); setSuccess(''); setFocusBorrower(Date.now()) }}>Next borrower</Button>

            </div>

            {visibleBlockers.length ? <ul role="alert" className="auth-error mb-4 list-inside list-disc rounded-xl p-3 text-sm">{visibleBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}

            {borrower.hasAttendance === false && !payload ? <div className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-4 text-sm">Record entry with the user's permanent QR at the attendance scanner, then <Button disabled={busy} variant="secondary" onClick={() => { if (pickupContext) void loadPickup(pickupContext) }}>Refresh pickup</Button>.</div> : borrower.hasAttendance === false ? <div className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-4 dark:border-white/15"><p className="text-sm font-semibold">Attendance is not recorded yet.</p><p className="mt-1 text-xs opacity-65">Use this QR to record entry here. No second scan is needed.</p>{!entryState && !entryError ? <p role="status" className="mt-2 text-xs">Checking entry availability…</p> : null}{entryState && !entryAllowed ? <p className="mt-2 text-xs font-semibold">{!entryState.entryOpen ? 'Entry is closed for the current operating hours or closing cutoff.' : !entryState.allowBorrowing ? 'Borrowing entry is restricted at this time.' : 'The library is at capacity.'}</p> : null}{entryError ? <p role="alert" className="auth-error mt-2 rounded-xl p-2 text-xs">{entryError}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy || !entryAllowed} onClick={() => void checkInHere()}>Check in here</Button>{!entryAllowed ? <Button variant="ghost" disabled={busy} onClick={() => setEntryAttempt(value => value + 1)}>Check availability again</Button> : null}</div></div> : null}

            {borrower.eligible || pickupContext ? <>

              {!pickupContext ? <DeskScanInput key="borrow-book" autoSubmit label="Book barcode" value={barcode} disabled={busy} focusRequest={scanFocus} actionLabel={busy ? 'Checking…' : 'Look up'} onChange={value => { setBarcode(value); setCopy(null); setSelectedRequest(null); key.current = '' }} onScan={value => void verifyCopy(value)} /> : null}

              {copy ? <div className="mt-4 rounded-2xl bg-[#0b5ea2]/5 p-4 dark:bg-white/10"><h3 className="break-words text-lg font-bold">{copy.copy.title}</h3><p className="mt-1 break-all font-mono text-xs opacity-65">{copy.copy.barcode} · {copy.copy.condition}</p>{selectedRequest ? <p className="mt-2 text-xs font-semibold">Ready pickup request matched automatically.</p> : null}{copy.blockers.length ? <ul role="alert" className="auth-error mt-3 list-inside list-disc rounded-xl p-3 text-sm">{copy.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}{copy.eligible && borrower.eligible ? <><p className="mt-3 text-xs opacity-70">{mode === 'InLibrary' ? 'For use inside the library; hand back before the closing cutoff.' : 'Match the borrower and physical book, then confirm.'}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button disabled={busy} className="flex-1" onClick={() => void confirm()}><CheckCircle2 size={17} />{busy ? 'Saving…' : mode === 'InLibrary' ? 'Confirm in-library use' : pickupContext ? 'Confirm handover' : 'Confirm checkout'}</Button><Button disabled={busy} variant="ghost" onClick={() => { if (pickupContext) { void loadPickup(pickupContext); return } setCopy(null); setBarcode(''); key.current = ''; setScanFocus(value => value + 1) }}>{pickupContext ? 'Refresh pickup' : 'Clear book'}</Button></div></> : null}</div> : null}

              <p className="mt-3 text-xs opacity-55">{pickupContext ? 'No loan is recorded until you confirm the physical handover.' : 'The borrower stays selected for their next book. Choose Next borrower when finished.'}</p>

            </> : null}

            {mode === 'TakeHome' && borrower.requests?.length ? <details className="mt-4 rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/15"><summary className="cursor-pointer text-xs font-semibold">Book requests ({borrower.requests.length})</summary><div className="mt-3 space-y-3">{borrower.requests.map(request => <div key={request.reservationId}><p className="text-sm font-semibold">{request.title} · {request.statusLabel}</p><p className="break-all text-xs opacity-60">{request.barcode ?? 'Waiting for a copy'}</p>{request.pickupDeadline ? <p className="text-xs opacity-60">Collect by {when(request.pickupDeadline)}</p> : null}</div>)}</div></details> : null}

          </>}

        </>}

      </div>

    </SectionCard>

    <details className="mb-6 rounded-2xl border border-[#0b5ea2]/10 bg-white p-5 dark:border-white/15 dark:bg-[#001a4d]"><summary className="cursor-pointer text-sm font-bold">In-library use & history <span className="ml-2 font-normal opacity-60">{uses.filter(use => !use.ended_at).length} open</span></summary><div className="mt-4 space-y-3">{listError ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{listError}</p> : uses.length ? uses.map(use => <div key={use.use_id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#0b5ea2]/15 p-3 sm:flex-row sm:items-center dark:border-white/15"><div className="min-w-0"><p className="break-words text-sm font-bold">{use.title}</p><p className="break-all text-xs opacity-65">{use.barcode} · {use.full_name} · {use.school_id}</p><p className="mt-1 text-xs opacity-65">{use.status === 'Review' ? 'Not handed back — staff review required' : use.status} · Hand back {when(use.hand_back_by)}</p></div>{!use.ended_at ? <Button variant="secondary" disabled={busy || Boolean(returnTarget)} onClick={() => setReturnTarget({ value: use.barcode, key: Date.now() })}>Return book</Button> : null}</div>) : <p className="text-sm opacity-65">No in-library use recorded.</p>}</div></details>

    {returnTarget ? <CirculationReturnDialog key={`${returnTarget.value}-${returnTarget.key}`} barcode={returnTarget.value} onClose={() => setReturnTarget(null)} onReturned={message => { reset(); setMode('Return'); setReturnTarget(null); setSuccess(message); setBarcode(''); setScanFocus(value => value + 1); onChanged(); void load() }} /> : null}

  </>

}
