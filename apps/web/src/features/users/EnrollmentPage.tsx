import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { enrollmentApi, EnrollmentError, type RosterPreview, type RowIssue, type Semester } from './enrollment-api'
import { RosterPreviewTable } from './RosterPreviewTable'
import { usersApi, type UserDetail } from './users-api'

const field='mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 dark:border-slate-600 dark:bg-slate-900 dark:text-white'
const displayTime=(value:string|null)=>value?new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)):'—'
const localInput=(value:string)=>new Date(+new Date(value)+8*3_600_000).toISOString().slice(0,16)
const errorText=(error:unknown)=>error instanceof Error?error.message:'The action could not be completed.'

export function EnrollmentPage({area='librarian'}:{area?:'admin'|'librarian'}) {
  const [terms,setTerms]=useState<Semester[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0)
  const [selected,setSelected]=useState<number|null>(null),[archive,setArchive]=useState(false),[editor,setEditor]=useState<'new'|'edit'|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    enrollmentApi.overview(controller.signal).then(value=>{setTerms(value);setError('')})
      .catch(e=>{if(!controller.signal.aborted)setError(errorText(e))})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[revision])
  const visible=terms.filter(term=>archive?term.status==='Ended':term.status!=='Ended')
  const term=visible.find(t=>Number(t.semester_id)===selected)??visible[0]
  const hasActive=terms.some(t=>t.status==='Active')
  function reload(){setRevision(v=>v+1)}
  async function transition(action:'start'|'end'){
    if(!term||busy)return
    setBusy(true);setError('');setNotice('')
    try{
      await enrollmentApi[action](term.semester_id)
      setNotice(action==='end'?'Semester ended. Student accounts and records are saved in Semester Archive.':'Semester started. Students on the roster can register.')
      if(action==='end')setArchive(true)
      reload()
    }catch(e){setError(errorText(e));throw e}finally{setBusy(false)}
  }
  return <div className="space-y-5 text-slate-950 dark:text-white">
    <PageHeader eyebrow="User management" title="Student enrollment" action={<Link className="rounded-xl border border-current/20 px-4 py-2 text-sm font-semibold" to={`/${area}/users`}>Back to users</Link>}/>
    <div className="flex flex-wrap gap-2" aria-label="Enrollment sections">
      <Button variant={archive?'secondary':'primary'} onClick={()=>{setArchive(false);setEditor(null);setSelected(null)}}>Semesters</Button>
      <Button variant={archive?'primary':'secondary'} onClick={()=>{setArchive(true);setEditor(null);setSelected(null)}}>Semester Archive</Button>
      {!archive&&<Button variant="secondary" onClick={()=>setEditor('new')}>+ Add Semester</Button>}
      <Button variant="ghost" onClick={reload}>Refresh</Button>
    </div>
    {loading&&<p role="status">Loading semesters…</p>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {editor&&<SemesterEditor key={editor+String(term?.semester_id)} term={editor==='edit'?term:undefined} onCancel={()=>setEditor(null)} onSaved={id=>{setEditor(null);setSelected(id);setNotice('Semester schedule saved.');reload()}}/>}
    {!loading&&!error&&!visible.length&&<SectionCard className="p-5"><p>{archive?'Ended semesters will appear here.':'Add a semester to set its dates and upload the registrar roster.'}</p></SectionCard>}
    {term&&<>
      <SectionCard className="space-y-4 p-5">
        <label className="block max-w-lg text-sm font-semibold">Choose semester
          <select className={field} value={term.semester_id} onChange={e=>{setSelected(Number(e.target.value));setEditor(null)}}>
            {visible.map(t=><option key={t.semester_id} value={t.semester_id}>{t.academic_year} · {t.term_name} · {t.status}</option>)}
          </select>
        </label>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div><p className="font-semibold">Status</p><p>{term.status}</p></div>
          <div><p className="font-semibold">Scheduled end</p><p>End of {term.end_date} (Philippine time)</p></div>
          <div><p className="font-semibold">{term.status==='Ended'?'Ended on':'Earliest manual end'}</p><p>{displayTime(term.ended_at??term.manual_end_at)}{term.end_kind? ` · ${term.end_kind}`:''}</p></div>
        </div>
        {term.latest_roster?<p className="break-words text-sm">Latest upload: {term.latest_roster.file_name} · {term.latest_roster.student_count} rows · {term.latest_roster.complete?'Complete':'Partial'}</p>:<p className="text-sm">No roster uploaded yet.</p>}
        {term.status==='Draft'&&<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={()=>setEditor('edit')}>Edit end dates</Button>
          <SemesterAction action="start" disabled={busy||hasActive||!term.has_complete} onConfirm={()=>transition('start')}/>
          {hasActive&&<p className="w-full text-sm">End the active semester before starting this one.</p>}
          {!term.has_complete&&<p className="w-full text-sm">Upload the complete school roster to start this semester.</p>}
        </div>}
        {term.status==='Active'&&<div className="space-y-2">
          {!term.can_end&&<p className="text-sm">Can be ended from {displayTime(term.manual_end_at)}. Refresh when that time arrives.</p>}
          <SemesterAction action="end" disabled={busy||!term.can_end} count={Number(term.active_accounts)} onConfirm={()=>transition('end')}/>
        </div>}
      </SectionCard>
      {term.status!=='Ended'&&<RosterUpload key={`upload-${term.semester_id}`} term={term} onSaved={message=>{setNotice(message);reload()}}/>}
      <RosterRecords key={`records-${term.semester_id}`} term={term} revision={revision}/>
    </>}
  </div>
}

function SemesterEditor({term,onCancel,onSaved}:{term?:Semester;onCancel:()=>void;onSaved:(id:number)=>void}){
  const [year,setYear]=useState(term?.academic_year??''),[name,setName]=useState(term?.term_name??'1st Semester')
  const [endDate,setEndDate]=useState(term?.end_date??''),[unlock,setUnlock]=useState(term&&term.manual_end_at!==term.scheduled_end_at?localInput(term.manual_end_at):'')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('')
    try{const data=await enrollmentApi.save({semesterId:term?.semester_id,academicYear:year,termName:name,endDate,manualEndAt:unlock});onSaved(data.semesterId)}
    catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  return <SectionCard className="p-5"><form className="space-y-4" onSubmit={submit}>
    <h2 className="text-balance text-lg font-bold">{term?'Edit semester dates':'Add semester'}</h2>
    <p className="text-pretty text-sm">Both dates lock when you start the semester. All times are Philippine time.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">School year<input required readOnly={!!term} className={field} placeholder="2026-2027" maxLength={9} value={year} onChange={e=>setYear(e.target.value)}/></label>
      <label className="text-sm font-semibold">Semester<select disabled={!!term} className={field} value={name} onChange={e=>setName(e.target.value)}><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></label>
      <label className="text-sm font-semibold">Scheduled end date<input required type="date" className={field} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
      <label className="text-sm font-semibold">Earliest manual end (optional)<input type="datetime-local" className={field} value={unlock} onChange={e=>setUnlock(e.target.value)}/><span className="mt-1 block text-xs font-normal">Leave blank to prevent ending early.</span></label>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy?'Saving…':'Save semester'}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form></SectionCard>
}

function SemesterAction({action,disabled,count,onConfirm}:{action:'start'|'end';disabled:boolean;count?:number;onConfirm:()=>Promise<void>}){
  const ref=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const label=action==='start'?'Start Semester':'End Semester'
  return <>
    <Button disabled={disabled} onClick={()=>{setError('');ref.current?.showModal()}}>{label}</Button>
    <dialog ref={ref} role="alertdialog" aria-label={label} onCancel={e=>{if(busy)e.preventDefault()}}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-6 text-slate-950 backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-white">
      <h2 className="text-balance text-xl font-bold">{label}?</h2>
      <p className="my-4 text-pretty text-sm">{action==='start'
        ?'Students on the uploaded roster can register. Both end settings lock immediately.'
        :`${count??0} active Student accounts linked to this semester will be signed out and deactivated. Their records stay in Semester Archive, and outstanding returns and payments can still be processed.`}</p>
      {error&&<p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={()=>ref.current?.close()}>Cancel</Button>
        <Button disabled={busy} onClick={()=>{setBusy(true);setError('');void onConfirm().then(()=>ref.current?.close()).catch(e=>setError(errorText(e))).finally(()=>setBusy(false))}}>{busy?'Saving…':label}</Button>
      </div>
    </dialog>
  </>
}

function RosterUpload({term,onSaved}:{term:Semester;onSaved:(message:string)=>void}){
  const [file,setFile]=useState<File|null>(null),[sourceDate,setSourceDate]=useState(''),[scope,setScope]=useState('Complete')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[issues,setIssues]=useState<RowIssue[]>([])
  const input=useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<RosterPreview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [retry, setRetry] = useState(0)
  function selectFile(next: File | null) {
    setPreview(null)
    setPreviewError('')
    setError('')
    setIssues([])
    setFile(next)
  }
  const remove=()=>{selectFile(null);if(input.current)input.current.value=''}
  useEffect(() => {
    if (!file) return
    const controller = new AbortController()
    enrollmentApi.preview(term.semester_id, file, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPreview(result) })
      .catch(error => { if (!controller.signal.aborted) setPreviewError(errorText(error)) })
    return () => controller.abort()
  }, [file, term.semester_id, retry])
  async function upload(e:FormEvent){
    e.preventDefault();if(!file || !preview || preview.errorCount || busy)return;setError('');setIssues([]);setBusy(true)
    try{
      const body=new FormData();body.set('roster',file);body.set('sourceDate',sourceDate);body.set('scope',scope)
      const result=await enrollmentApi.upload(term.semester_id,body)
      onSaved(result.alreadyUploaded?'This roster was already uploaded.':`Roster uploaded. ${result.students} student records accepted.${result.missingEmail?` ${result.missingEmail} need a school email before registration.`:''}`)
      remove()
    }catch(e){setError(errorText(e));if(e instanceof EnrollmentError)setIssues(e.issues)}
    finally{setBusy(false)}
  }
  return <SectionCard className="p-5"><form className="space-y-4" onSubmit={upload}>
    <h2 className="text-balance text-lg font-bold">Upload roster</h2>
    <p className="text-pretty text-sm">Choose the registrar CSV or Excel file. A successful upload marks matching students as enrolled automatically.</p>
    <p className="text-pretty text-sm">A complete roster replaces the enrollment list. A partial update changes only the Student IDs in that file.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Roster date<input className={field} type="date" value={sourceDate} onChange={e=>setSourceDate(e.target.value)} required/></label>
      <label className="text-sm font-semibold">Roster type<select className={field} value={scope} onChange={e=>setScope(e.target.value)}><option value="Complete">Complete school roster</option><option value="Partial">Partial update</option></select></label>
    </div>
    <label className="block text-sm font-semibold">Roster file<input ref={input} type="file" accept=".csv,.xlsx" className={field} disabled={busy} onChange={e=>selectFile(e.target.files?.[0]??null)}/></label>
    <SelectedFilePreview file={file} onRemove={remove} disabled={busy} display="icon"/>
    {file && !preview && !previewError && <p role="status" className="text-sm">Reading roster and counting students…</p>}
    {previewError && <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300">
      <p>{previewError}</p><Button type="button" variant="secondary" onClick={() => { setPreviewError(''); setRetry(value => value + 1) }}>Retry preview</Button>
    </div>}
    {preview && <RosterPreviewTable preview={preview}/>}
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><p>{error}</p>{issues.length>0&&<ul className="mt-2 list-disc pl-5">{issues.map(issue=><li key={issue.sheet+issue.row}>{issue.sheet}, row {issue.row}: {issue.errors.join(' ')}</li>)}</ul>}</div>}
    <Button disabled={busy||!preview||preview.errorCount>0} type="submit">{busy?'Importing…':'Import roster'}</Button>
  </form></SectionCard>
}

function RosterRecords({term,revision}:{term:Semester;revision:number}){
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1)
  const [data,setData]=useState<Awaited<ReturnType<typeof enrollmentApi.roster>>|null>(null)
  const [error,setError]=useState(''),[detail,setDetail]=useState<UserDetail|null>(null)
  useEffect(()=>{
    const controller=new AbortController()
    enrollmentApi.roster(term.semester_id,page,query,controller.signal).then(value=>{setData(value);setError('')})
      .catch(e=>{if(!controller.signal.aborted)setError(errorText(e))})
    return ()=>controller.abort()
  },[term.semester_id,page,query,revision])
  async function records(id:number){setError('');try{setDetail(await usersApi.detail(id))}catch(e){setError(errorText(e))}}
  return <SectionCard className="space-y-4 p-5">
    <h2 className="text-balance text-lg font-bold">{term.status==='Ended'?'Archived students':'Roster students'}</h2>
    <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim())}}>
      <label className="min-w-52 flex-1 text-sm font-semibold">Find a student<input className={field} value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Name or Student ID"/></label><Button type="submit">Search</Button>
    </form>
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {!data&&!error&&<p role="status">Loading records…</p>}
    {data?.rows.length===0&&<p>No students match this search.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {data?.rows.map(row=><li key={row.school_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="break-words font-semibold">{row.student_name}</p><p className="text-sm tabular-nums">{row.school_id} · {[row.program,row.year_level].filter(Boolean).join(' · ')||'Student'}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{row.deactivated_at_end?'Deactivated when semester ended':row.closed_status??(row.account_id?'Account linked':'No account yet')}</p>
          {row.email_mismatch&&<p className="text-sm font-semibold text-amber-800 dark:text-amber-300">School email differs from the linked account. Check with the registrar.</p>}</div>
        {term.status==='Ended'&&row.account_id&&<Button variant="secondary" onClick={()=>void records(Number(row.account_id))}>View saved records</Button>}
      </li>)}
    </ul>
    {data&&(page>1||data.more)&&<div className="flex items-center gap-2"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(v=>v-1)}>Previous</Button><span className="text-sm tabular-nums">Page {page}</span><Button variant="secondary" disabled={!data.more} onClick={()=>setPage(v=>v+1)}>Next</Button></div>}
    {detail&&<div className="space-y-3 rounded-xl border border-current/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-balance font-bold">Saved records · {detail.full_name}</h3><Button variant="secondary" onClick={()=>setDetail(null)}>Close records</Button></div>
      <p className="text-sm">These are the existing account records. Returns and payments processed later are included.</p>
      {Object.entries(detail.records??{}).map(([key,rows])=><details key={key} className="rounded-xl border border-current/15 p-3"><summary className="cursor-pointer font-semibold capitalize">{key.replaceAll('_',' ')} ({rows.length})</summary>
        {rows.map(row=><dl key={row.id} className="mt-2 rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">{Object.entries(row).map(([label,value])=><div key={label} className="flex flex-wrap gap-x-2"><dt className="capitalize">{label.replaceAll('_',' ')}:</dt><dd className="break-words">{String(value??'—')}</dd></div>)}</dl>)}
      </details>)}
    </div>}
  </SectionCard>
}
