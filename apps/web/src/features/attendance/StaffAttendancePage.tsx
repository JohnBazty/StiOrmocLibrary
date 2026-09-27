import { useEffect, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { attendanceApi, type AttendanceRow } from './attendance-api'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const filters = { period: 'daily' as const, date: today, weekStart: today, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), academicTermId: '', q: '', role: '', purpose: '', presence: '', page: 1, limit: 50 }

export function StaffAttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [error, setError] = useState('')
  async function load() {
    try { setRows((await attendanceApi.logs(filters)).rows); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load attendance.') }
  }
  useEffect(() => { void load() }, [])
  return <><PageHeader eyebrow="Staff operations" title="Attendance today" action={<button onClick={() => void load()} className="rounded-xl border border-[#003399]/20 px-4 py-2 text-[#003399]">Refresh</button>} />
    <p className="mb-4 text-sm text-[#003399]/70">Use Scan attendance to check visitors in or out.</p>
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <SectionCard className="overflow-x-auto"><table className="w-full text-left text-sm text-[#003399]"><thead><tr><th className="p-3">Visitor</th><th className="p-3">Time in</th><th className="p-3">Time out</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-[#003399]/10"><td className="p-3">{row.visitor_name}<br />{row.school_id}</td><td className="p-3">{row.time_in}</td><td className="p-3">{row.time_out ?? '—'}</td><td className="p-3">{row.presence}</td></tr>)}</tbody></table></SectionCard>
  </>
}
