import { BookOpen, CheckCircle2, CircleAlert, RotateCcw, UserRound } from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, SectionCard } from '../../components/ui'

import { deskCirculationApi, type DeskMode, type DeskBorrower, type DeskCopy, type InLibraryUse, type PickupSelection } from './desk-circulation-api'

import { DeskScanInput } from './DeskScanInput'

import { CirculationReturnDialog } from './CirculationReturnDialog'

import { attendanceApi, type OperationalState } from '../attendance/attendance-api'
import { BORROWING_CLOSED, borrowingClosedMessage, checkoutBlockerLines } from './checkout-blockers'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'

const when = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

export function CirculationDesk({ onChanged, returnBarcode, borrowerRequest, onBusyChange, dashboard = false, schoolIdRequest, borrowerQrRequest, automaticScanning = false, portalRoot }: {

  dashboard?: boolean
  borrowerQrRequest?:{payload:string;key:number}
  automaticScanning?:boolean
  portalRoot?:HTMLElement
  schoolIdRequest?: {schoolId:string;key:number}

  onChanged: () => void

  returnBarcode?: { value: string; key: number }

  borrowerRequest?: PickupSelection & { key: number }

  onBusyChange?: (busy: boolean) => void

}) {

  const [manual,setManual]=useState(false)

  const [mode, setMode] = useState<DeskMode>('TakeHome')

  const [payload, setPayload] = useState('')

  const [barcode, setBarcode] = useState('')

  const [borrower, setBorrower] = useState<DeskBorrower | null>(null)

  const [copy, setCopy] = useState<DeskCopy | null>(null)

  const [uses, setUses] = useState<InLibraryUse[]>([])

  const [listError, setListError] = useState('')

  const [busy, setBusy] = useState(false)
  const { ask, dialog: confirmSave } = useConfirmSave()

  const [error, setError] = useState('')

  const [success, setSuccess] = useState('')

  const [pickupContext, setPickupContext] = useState<PickupSelection | null>(null)

  const [selectedRequest, setSelectedRequest] = useState<number | null>(null)

  const [returnTarget, setReturnTarget] = useState<{ value: string; key: number } | null>(null)

  const [focusBorrower, setFocusBorrower] = useState<number | undefined>()

  const identityManual = useRef(false)

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

    setPickupContext(null); setSelectedRequest(null); setPayload(''); setBarcode(''); setBorrower(null); setCopy(null); setError(''); setEntryState(null); setEntryError(''); key.current = ''; attendanceKey.current = ''; activity.current = 0; identityManual.current = false

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

  async function verifyUser(value: string, useMode: DeskMode = mode, useManual = manual || identityManual.current) {

    if (saving.current || !value.trim()) return

    setSelectedRequest(null); saving.current = true; setBusy(true); setError(''); setSuccess(''); setBorrower(null); setCopy(null); key.current = ''

    try { const result = await (useManual?deskCirculationApi.manualBorrower(value,useMode):deskCirculationApi.borrower(value, useMode)); identityManual.current = useManual; setBorrower(result); setPayload(value); attendanceKey.current = crypto.randomUUID(); activity.current = Date.now(); setScanFocus(value => value + 1) }

    catch (reason) { setError(reason instanceof Error ? reason.message : 'The borrower could not be found.') }

    finally { saving.current = false; setBusy(false) }

  }

  useEffect(() => {
    if (schoolIdRequest && !saving.current) { reset(); setManual(false); setMode('TakeHome'); void verifyUser(schoolIdRequest.schoolId, 'TakeHome', true) }
  }, [schoolIdRequest?.key])

  useEffect(()=>{if(borrowerQrRequest&&!saving.current){reset();setManual(false);setMode('TakeHome');void verifyUser(borrowerQrRequest.payload,'TakeHome',false)}},[borrowerQrRequest?.key])

  async function verifyCopy(value: string) {

    if (saving.current || !value.trim()) return

    saving.current = true; setBusy(true); setError(''); setSuccess(''); setCopy(null); key.current = ''

    try {

      setBarcode(value)

      if (Date.now() - activity.current > 5 * 60_000) { reset(); setFocusBorrower(Date.now()); throw new Error('Look up the borrower again after five minutes of inactivity.') }

      const request = mode === 'TakeHome' ? borrower?.requests?.find(request => ['Ready for pickup','Awaiting handover'].includes(request.statusLabel) && request.barcode?.trim().toUpperCase() === value.trim().toUpperCase()) : undefined

      const requestId = request?.reservationId ?? null

      setSelectedRequest(requestId)

      setCopy(await ((manual||identityManual.current)?deskCirculationApi.manualPreview(payload,value,mode,requestId):deskCirculationApi.preview(payload, value, mode, requestId)))

      activity.current = Date.now()

      key.current = crypto.randomUUID()

    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The book could not be verified.') }

    finally { saving.current = false; setBusy(false) }

  }

  async function confirm() {

    if (saving.current || !key.current || !copy?.eligible || !borrower?.eligible) return

    saving.current = true; setBusy(true); setError('')

    try {

      const result = pickupContext ? await deskCirculationApi.checkoutRequest(pickupContext, barcode, copy.copy.id, key.current) : await ((manual||identityManual.current)?deskCirculationApi.manualCheckout(payload,barcode,mode,key.current,selectedRequest):deskCirculationApi.checkout(payload, barcode, mode, key.current, selectedRequest))

      const title = result.copy?.title ?? result.title ?? 'Material'

      setSuccess(mode === 'InLibrary' ? `${title} assigned for in-library use. Hand back by ${when(result.handBackBy!)}.` : `${title} checked out. Due ${when(result.dueAt!)}.`)

      setCopy(null); setBarcode(''); setSelectedRequest(null); key.current = ''; onChanged(); void load()

      if (pickupContext) { reset(); return }

      try {

        const updated = await ((manual||identityManual.current)?deskCirculationApi.manualBorrower(payload,mode):deskCirculationApi.borrower(payload, mode))

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

    const needsLibraryState = Boolean(borrower && (borrower.hasAttendance === false || borrower.blockers.includes(BORROWING_CLOSED)))
    if (!needsLibraryState) return

    let active = true

    setEntryState(null); setEntryError('')

    attendanceApi.state().then(result => { if (active) setEntryState(result) })

      .catch(reason => { if (active) setEntryError(reason instanceof Error ? reason.message : 'Entry availability could not be checked.') })

    return () => { active = false }

  }, [borrower?.user.userId, borrower?.hasAttendance, borrower?.blockers, entryAttempt])

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

      if(manual||identityManual.current)await deskCirculationApi.manualCheckIn(payload,mode,attendanceKey.current)
      else await attendanceApi.scan(payload, 'Book Borrowing', attendanceKey.current, 'Entry')

      const updated = await ((manual||identityManual.current)?deskCirculationApi.manualBorrower(payload,mode):deskCirculationApi.borrower(payload, mode))

      if (updated.user.userId !== borrower.user.userId) throw new Error('Please rescan the borrower.')

      setBorrower(updated); activity.current = Date.now(); setScanFocus(value => value + 1)

      setSuccess(updated.eligible ? manual?'Attendance recorded. Enter the book barcode to continue.':'Attendance recorded. Scan the book to continue.' : 'Attendance recorded. Resolve the borrowing restrictions before checkout.')

    } catch (reason) {

      setError(reason instanceof Error ? reason.message : 'Check-in could not be recorded. Retry with the same QR.')

      setEntryAttempt(value => value + 1)

    } finally { saving.current = false; setBusy(false) }

  }

  const visibleBlockers = borrower?.blockers.filter(blocker => !payload || borrower.hasAttendance !== false || blocker !== 'Check in at the library entrance before borrowing.') ?? []
  const noticeLines = checkoutBlockerLines(visibleBlockers, entryState?.state)

  const entryAllowed = Boolean(entryState?.entryOpen && entryState.allowBorrowing && entryState.available > 0)

  const currentStep = !borrower || !borrower.eligible ? 0 : !copy || !copy.eligible ? 1 : 2

  return <div className={dashboard ? 'w-full' : 'mx-auto w-full max-w-4xl'}>
    {confirmSave}

    <SectionCard className={dashboard ? 'overflow-hidden' : 'mb-6 overflow-hidden'}>

      <div className={dashboard ? 'border-b border-[#0b5ea2]/10 p-4 dark:border-white/10' : 'border-b border-[#0b5ea2]/10 p-5 sm:p-6 dark:border-white/10'}>

        <div className="flex flex-wrap items-center justify-between gap-4">

          {!dashboard ? <div><h2 ref={heading} tabIndex={-1} className="text-balance text-xl font-bold outline-none">{mode === 'Return' ? 'Return a book' : 'Lend a book'}</h2><p className="mt-1 text-pretty text-sm leading-6 opacity-75">{pickupContext ? 'Pickup details are ready. Check the borrower and book before handover.' : mode === 'Return' ? 'Find the copy, check its condition, then confirm the return.' : 'Find the borrower, scan the copy, then review before lending.'}</p></div> : null}
          <div className="grid w-full grid-cols-2 gap-3" role="group" aria-label="Counter task">
            {(['TakeHome', 'Return'] as const).map(task => <button key={task} type="button" aria-pressed={task === 'Return' ? mode === 'Return' : mode !== 'Return'} disabled={busy} onClick={() => { reset(); setSuccess(''); setMode(task) }} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 sm:p-4 ${(task === 'Return' ? mode === 'Return' : mode !== 'Return') ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-[#0b5ea2]/20 bg-white hover:bg-[#0b5ea2]/5 dark:border-white/20 dark:bg-white/5'}`}>
              {task === 'Return' ? <RotateCcw size={22} aria-hidden="true" className="shrink-0" /> : <BookOpen size={22} aria-hidden="true" className="shrink-0" />}<span><span className="block text-sm font-bold">{task === 'Return' ? dashboard ? 'Quick return' : 'Return' : dashboard ? 'Borrow books' : 'Borrow'}</span><span aria-hidden="true" className="mt-1 hidden text-xs opacity-80 sm:block">{task === 'Return' ? 'Receive a book back' : 'Hand a book to a borrower'}</span></span>
            </button>)}
          </div>

        </div>

      </div>

      <div className={dashboard ? 'p-4' : 'p-5 sm:p-6'}>
        {mode !== 'Return' ? <ol aria-label="Borrowing progress" className="mb-6 grid grid-cols-3 gap-2 border-b border-[#0b5ea2]/10 pb-5 dark:border-white/15">{['Borrower', 'Book', 'Confirm'].map((step, index) => <li key={step} aria-current={index === currentStep ? 'step' : undefined} className={`flex items-center gap-2 text-xs sm:text-sm ${index === currentStep ? 'font-bold' : 'opacity-65'}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${index === currentStep ? 'bg-[#0b5ea2] text-white' : 'border border-[#0b5ea2]/20 dark:border-white/25'}`}>{index < currentStep ? <CheckCircle2 size={16} aria-label="Complete" /> : index + 1}</span>{step}</li>)}</ol> : null}
        {!pickupContext && !dashboard ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className={dashboard ? 'sr-only' : 'text-sm font-semibold'}>{manual ? mode === 'Return' ? 'Enter the barcode printed on the copy' : 'Enter details from the School ID and book label' : 'Scan a code or use the camera'}</p><Button variant="secondary" disabled={busy||Boolean(borrower)} aria-pressed={manual} onClick={()=>{reset();setManual(value=>!value);setSuccess('')}}>{manual?'Use scanner':'Enter manually'}</Button></div> : null}

        {success ? <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl bg-[#FFF200] p-4 text-sm font-semibold text-[#0b5ea2]"><CheckCircle2 className="shrink-0" size={19} />{success}</div> : null}

        {error ? <p role="alert" className="auth-error mb-5 rounded-xl p-4 text-sm">{error}</p> : null}

        {mode === 'Return' ? <div className="mx-auto max-w-xl py-2"><h3 className="text-lg font-bold">Which book is being returned?</h3><p className="mb-5 mt-1 text-sm opacity-65">Enter the barcode printed on the book, scan it, or find the borrower/title in the loans below and select Return book.</p><DeskScanInput focusOnLoad={dashboard} emphasized={dashboard} showCaptureOptions key="return-book" manual={manual} autoSubmit={!manual} focusRequest={scanFocus} label="Book barcode" value={barcode} disabled={busy} actionLabel="Look up" onChange={setBarcode} onScan={value => { if (value.trim()) setReturnTarget({ value, key: Date.now() }) }} /></div> : <>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-balance text-lg font-bold">{pickupContext ? 'Review this pickup' : !borrower ? 'Who is borrowing?' : !copy ? 'Which book are they borrowing?' : copy.eligible && borrower.eligible ? 'Ready to lend?' : 'Review this book'}</h3><p className="mt-1 text-sm leading-6 opacity-75">{pickupContext ? 'No loan is saved until you confirm handover.' : !borrower ? manual ? 'Enter their School ID, then check the name and photo.' : 'Scan the borrower’s QR from their account or School ID.' : !copy ? manual ? 'Enter the barcode printed on the physical copy.' : 'Scan the barcode on the physical copy.' : 'Check the borrower and book below before confirming.'}</p></div><label className="block text-xs font-semibold">Borrowing type<select aria-label="Book use" disabled={busy || Boolean(pickupContext)} value={mode} onChange={event => { const nextMode = event.target.value as DeskMode; setMode(nextMode); setBarcode(''); setCopy(null); setSelectedRequest(null); key.current = ''; if (borrower) void verifyUser(payload, nextMode) }} className="mt-2 block min-h-11 w-full rounded-lg border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2]"><option value="TakeHome">Take home</option><option value="InLibrary">Inside the library</option></select></label></div>

          {!borrower && pickupContext ? <div><p role="status" className="text-sm">{busy ? 'Loading borrower and assigned book…' : 'Pickup details are unavailable.'}</p><Button disabled={busy} variant="secondary" onClick={() => void loadPickup(pickupContext)}>Refresh pickup</Button></div> : !borrower && manual ? <form className="mx-auto max-w-xl space-y-3" onSubmit={event=>{event.preventDefault();void verifyUser(payload)}}><label className="block text-sm font-bold" htmlFor="manual-borrower-school-id">School ID</label><input id="manual-borrower-school-id" value={payload} maxLength={50} autoComplete="off" disabled={busy} onChange={event=>setPayload(event.target.value)} placeholder="Enter the borrower’s School ID" className="min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white p-3 text-[#0b5ea2]"/><p className="text-sm opacity-65">Match the name and photo to their physical School ID before lending.</p><Button type="submit" disabled={busy||!payload.trim()}>{busy?'Checking…':'Find borrower'}</Button></form> : !borrower ? <DeskScanInput allowIdBarcode={dashboard} focusOnLoad={dashboard} emphasized={dashboard} showCaptureOptions key="borrower" autoSubmit qr label={dashboard?"Borrower QR or School ID":"Borrower QR"} value={payload} disabled={busy} focusRequest={focusBorrower} actionLabel={busy ? 'Checking…' : 'Look up'} onChange={setPayload} onScan={value => void verifyUser(value, mode, dashboard && /^[A-Za-z0-9][A-Za-z0-9-]{2,49}$/.test(value.trim()) ? true : manual)} /> : <>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#0b5ea2]/15 p-4 dark:border-white/15">

              {borrower.user.photoUrl ? <img src={borrower.user.photoUrl} alt="Approved profile photo" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0b5ea2]/5 dark:bg-white/10"><UserRound size={22} /></span>}

              <div className="min-w-0 flex-1"><p className="break-words font-bold">{borrower.user.name}</p><p className="break-words text-xs opacity-65">{borrower.user.schoolId} · {borrower.user.role}</p><p className="mt-1 text-xs opacity-60">{borrower.enrollment}</p></div>

              <Button disabled={busy} variant="secondary" className="w-full sm:w-auto" onClick={() => { reset(); setSuccess(''); setFocusBorrower(Date.now()) }}>Next borrower</Button>

            </div>

            {noticeLines.length ? <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl p-4 text-sm"><CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden /><div><p className="font-semibold">This checkout cannot be confirmed yet</p><ul className="mt-1.5 list-disc space-y-1 pl-4">{noticeLines.map(line => <li key={line}>{line}</li>)}</ul></div></div> : null}

            {borrower.hasAttendance === false && !payload ? <div className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-4 text-sm">Record entry with the user's permanent QR at the attendance scanner, then <Button disabled={busy} variant="secondary" onClick={() => { if (pickupContext) void loadPickup(pickupContext) }}>Refresh pickup</Button>.</div> : borrower.hasAttendance === false ? <div className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-4 dark:border-white/15"><p className="text-sm font-semibold">Attendance is not recorded yet.</p><p className="mt-1 text-xs opacity-65">{(manual||identityManual.current)?"Record entry here after checking the borrower’s School ID.":"Use this QR to record entry here. No second scan is needed."}</p>{!entryState && !entryError ? <p role="status" className="mt-2 text-xs">Checking entry availability…</p> : null}{entryState && !entryAllowed ? <p className="mt-2 text-xs font-semibold">{!entryState.entryOpen ? 'Entry is closed for the current operating hours or closing cutoff.' : !entryState.allowBorrowing ? borrowingClosedMessage(entryState.state) : 'The library is at capacity.'}</p> : null}{entryError ? <p role="alert" className="auth-error mt-2 rounded-xl p-2 text-xs">{entryError}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy || !entryAllowed} onClick={() => void checkInHere()}>Check in here</Button>{!entryAllowed ? <Button variant="ghost" disabled={busy} onClick={() => setEntryAttempt(value => value + 1)}>Check availability again</Button> : null}</div></div> : null}

            {borrower.eligible || pickupContext ? <>

              {!pickupContext ? <DeskScanInput emphasized={dashboard} showCaptureOptions key="borrow-book" manual={manual} autoSubmit={!manual} label="Book barcode" value={barcode} disabled={busy} focusRequest={scanFocus} actionLabel={busy ? 'Checking…' : manual?'Find book':'Look up'} onChange={value => { setBarcode(value); setCopy(null); setSelectedRequest(null); key.current = '' }} onScan={value => void verifyCopy(value)} /> : null}

              {copy ? <div className="mt-4 rounded-2xl bg-[#0b5ea2]/5 p-4 dark:bg-white/10"><h3 className="break-words text-lg font-bold">{copy.copy.title}</h3><p className="mt-1 break-all font-mono text-xs opacity-65">{copy.copy.barcode} · {copy.copy.condition}</p>{selectedRequest ? <p className="mt-2 text-xs font-semibold">Ready pickup request matched automatically.</p> : null}{copy.blockers.length ? <ul role="alert" className="auth-error mt-3 list-inside list-disc rounded-xl p-3 text-sm">{copy.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}{copy.eligible && borrower.eligible ? <><p className="mt-3 text-xs opacity-70">{mode === 'InLibrary' ? 'For use inside the library; hand back before the closing cutoff.' : 'Match the borrower and physical book, then confirm.'}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button disabled={busy} className="flex-1" onClick={() => ask(`${mode === 'InLibrary' ? 'Record in-library use of' : pickupContext ? 'Hand over' : 'Check out'} ${copy.copy.title}.`, () => { void confirm() })}><CheckCircle2 size={17} />{busy ? 'Saving…' : mode === 'InLibrary' ? 'Confirm in-library use' : pickupContext ? 'Confirm handover' : 'Confirm checkout'}</Button><Button disabled={busy} variant="ghost" onClick={() => { if (pickupContext) { void loadPickup(pickupContext); return } setCopy(null); setBarcode(''); key.current = ''; setScanFocus(value => value + 1) }}>{pickupContext ? 'Refresh pickup' : 'Clear book'}</Button></div></> : null}</div> : null}

              <p className="mt-3 text-xs opacity-55">{pickupContext ? 'No loan is recorded until you confirm the physical handover.' : 'The borrower stays selected for their next book. Choose Next borrower when finished.'}</p>

            </> : null}

            {mode === 'TakeHome' && borrower.requests?.length ? <details className="mt-4 rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/15"><summary className="cursor-pointer text-xs font-semibold">Book requests ({borrower.requests.length})</summary><div className="mt-3 space-y-3">{borrower.requests.map(request => <div key={request.reservationId}><p className="text-sm font-semibold">{request.title} · {request.statusLabel}</p><p className="break-all text-xs opacity-60">{request.barcode ?? 'Waiting for a copy'}</p>{request.pickupDeadline ? <p className="text-xs opacity-60">Collect by {when(request.pickupDeadline)}</p> : null}</div>)}</div></details> : null}

          </>}

        </>}

      </div>

    </SectionCard>

    {!dashboard ? <details className="mx-auto mb-6 max-w-4xl rounded-2xl border border-[#0b5ea2]/10 bg-white p-5 dark:border-white/15 dark:bg-[#001a4d]"><summary className="cursor-pointer text-sm font-bold">In-library use & history <span className="ml-2 font-normal opacity-60">{uses.filter(use => !use.ended_at).length} open</span></summary><div className="mt-4 space-y-3">{listError ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{listError}</p> : uses.length ? uses.map(use => <div key={use.use_id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#0b5ea2]/15 p-3 sm:flex-row sm:items-center dark:border-white/15"><div className="min-w-0"><p className="break-words text-sm font-bold">{use.title}</p><p className="break-all text-xs opacity-65">{use.barcode} · {use.full_name} · {use.school_id}</p><p className="mt-1 text-xs opacity-65">{use.status === 'Review' ? 'Not handed back — staff review required' : use.status} · Hand back {when(use.hand_back_by)}</p></div>{!use.ended_at ? <Button variant="secondary" disabled={busy || Boolean(returnTarget)} onClick={() => setReturnTarget({ value: use.barcode, key: Date.now() })}>Return book</Button> : null}</div>) : <p className="text-sm opacity-65">No in-library use recorded.</p>}</div></details> : null}

    {returnTarget ? <CirculationReturnDialog key={`${returnTarget.value}-${returnTarget.key}`} barcode={returnTarget.value} portalRoot={portalRoot} onClose={() => setReturnTarget(null)} onReturned={message => { reset(); setMode('Return'); setReturnTarget(null); setSuccess(message); setBarcode(''); setScanFocus(value => value + 1); onChanged(); void load() }} /> : null}

  </div>

}
