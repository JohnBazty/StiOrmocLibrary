import { QrCode, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { enrollmentApi, type Semester, type StudentQrCard } from './enrollment-api'

type QrSemester = Pick<Semester, 'semester_id' | 'academic_year' | 'term_name' | 'status'>
const field = 'min-h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003399]'

export function StudentQrRosterPage() {
  const [terms, setTerms] = useState<QrSemester[]>([])
  const [semesterId, setSemesterId] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [accountStatus, setAccountStatus] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [rows, setRows] = useState<StudentQrCard[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setRows([])
    enrollmentApi.qrSemesters(controller.signal).then(value => {
      if (controller.signal.aborted) return
      setTerms(value)
      setSemesterId(current => value.some(term => term.semester_id === current) ? current : (value.find(term => term.status === 'Active') ?? value[0])?.semester_id ?? 0)
      setLoading(false)
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Unable to load semesters.'); setLoading(false) } })
    return () => controller.abort()
  }, [revision])

  useEffect(() => {
    if (!semesterId) return
    const controller = new AbortController()
    setLoading(true); setError(''); setRows([]); setMore(false)
    enrollmentApi.qrRoster(semesterId, page, query, controller.signal, accountStatus).then(result => {
      if (!controller.signal.aborted) { setRows(result.rows); setMore(result.more); setLoading(false) }
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Unable to load student QR codes.'); setLoading(false) } })
    return () => controller.abort()
  }, [semesterId, page, query, revision, accountStatus])

  return <>
    <PageHeader eyebrow="Student enrollment" title="Student QR roster" description="Find a student and view their library QR code from the semester roster." action={<Button variant="secondary" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />Refresh</Button>} />
    <SectionCard className="mb-5 border-l-4 border-l-[#FFF200] p-5">
      <div className="flex items-start gap-3 text-[#003399]"><QrCode size={24} className="shrink-0" /><div><h2 className="font-bold">Fresh roster, fresh QR codes</h2><p className="mt-1 text-sm leading-6">Every roster upload replaces student QR codes, even when the file is unchanged. Previously saved codes stop working. Download and give students their new code after an upload.</p><p className="mt-2 text-xs leading-5">Students must register before a library QR is available. Keep QR images private and share each code only with its student.</p></div></div>
    </SectionCard>
    <SectionCard className="mb-5 p-4"><form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()) }}>
      <label className="text-sm font-semibold text-[#003399]">Semester<select className={`${field} mt-2`} value={semesterId} onChange={event => { setRows([]); setSemesterId(Number(event.target.value)); setPage(1) }}><option value={0} disabled>Choose a semester</option>{terms.map(term => <option key={term.semester_id} value={term.semester_id}>{term.academic_year} · {term.term_name} · {term.status}</option>)}</select></label>
      <label className="text-sm font-semibold text-[#003399]">Account status<select className={`${field} mt-2`} value={accountStatus} onChange={event => { setRows([]); setPage(1); setAccountStatus(event.target.value) }}><option value="">All students</option><option value="Active">Active accounts</option><option value="Not registered">Not registered</option></select></label>
      <label className="text-sm font-semibold text-[#003399]">Find a student<input className={`${field} mt-2`} placeholder="Student name or ID" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <Button type="submit" disabled={!semesterId}><Search size={16} />Search</Button>
    </form></SectionCard>
    {error && <p role="alert" className="mb-5 rounded-xl border border-[#003399]/20 bg-white p-4 text-sm text-[#003399]">{error}</p>}
    {loading ? <SectionCard className="p-10 text-center"><p role="status">Loading student QR codes…</p></SectionCard> : !error && !rows.length ? <SectionCard className="p-10 text-center text-[#003399]"><QrCode className="mx-auto mb-3" size={32} /><h2 className="font-bold">{terms.length ? 'No students found' : 'No semester roster yet'}</h2><p className="mt-2 text-sm">{terms.length ? 'Try another name, Student ID, account status, or semester. Upload a roster in Student enrollment if this semester is empty.' : 'Add a semester and upload the registrar roster in Student enrollment.'}</p></SectionCard> : null}
    {!loading && !error && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map(student => <SectionCard key={student.school_id} className="flex min-w-0 flex-col overflow-hidden text-[#003399]">
      <div className="flex items-center justify-between gap-3 border-b border-[#003399]/10 p-4"><span className="text-xs font-bold uppercase tracking-wide">STI Library pass</span><span className="rounded-full bg-[#003399]/5 px-2 py-1 text-xs font-semibold">{student.qr_image ? 'QR ready' : 'QR unavailable'}</span></div>
      <div className="flex flex-1 flex-col items-center p-5 text-center">{student.qr_image ? <img src={student.qr_image} alt={`Library QR for ${student.student_name}`} width={256} height={256} className="aspect-square w-full max-w-56 bg-white" /> : <div className="flex aspect-square w-full max-w-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#003399]/25 p-4"><QrCode size={36} aria-hidden="true" /><p className="text-sm font-semibold">{student.qr_status}</p></div>}
        <h2 className="mt-4 break-words font-bold">{student.student_name}</h2><p className="mt-1 break-all font-mono text-sm">{student.school_id}</p><p className="mb-4 mt-2 text-xs">{[student.program, student.year_level].filter(Boolean).join(' · ') || 'Program not listed'}</p>
        {student.qr_image && <a className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#003399]/20 px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#003399]" download={`STI-Library-QR-${student.school_id.replace(/[^A-Za-z0-9_-]/g, '-')}.png`} href={student.qr_image}>Download QR</a>}
      </div>
    </SectionCard>)}</div>}
    {semesterId > 0 && <div className="mt-5 flex flex-wrap items-center justify-end gap-3 text-[#003399]"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm" aria-live="polite">Page {page}</span><Button variant="secondary" disabled={loading || !more} onClick={() => setPage(value => value + 1)}>Next</Button></div>}
  </>
}
