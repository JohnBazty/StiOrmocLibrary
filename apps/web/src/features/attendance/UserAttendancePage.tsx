import { useAttendanceRefresh } from './attendance-updates'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Clock3, Download, LibraryBig, QrCode } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { formatManilaTime12, formatPhDate } from '../notifications/LibrarySchedulePage'
import { attendanceApi, type AttendancePass } from './attendance-api'
import { RefreshButton } from '../../components/RefreshButton'
import { useLibraryOpenStatus } from '../notifications/useLibraryOpenStatus'

export function UserAttendancePage() {
  const [pass,setPass]=useState<AttendancePass|null>(null)
  const [qrUrl,setQrUrl]=useState('')
  const [loading,setLoading]=useState(true)
  const [downloading,setDownloading]=useState(false)
  const [error,setError]=useState('')
  const libraryStatus=useLibraryOpenStatus()
  const load=useCallback(async()=>{setLoading(true);setError('');try{const[data,blob]=await Promise.all([attendanceApi.myPass(),attendanceApi.passImage()]);setPass(data);setQrUrl(old=>{if(old)URL.revokeObjectURL(old);return URL.createObjectURL(blob)})}catch(e){setError(e instanceof Error?e.message:'Unable to load your attendance pass.')}finally{setLoading(false)}},[])
  useAttendanceRefresh(load)
  useEffect(()=>{void load()},[load])
  useEffect(()=>()=>{if(qrUrl)URL.revokeObjectURL(qrUrl)},[qrUrl])
  const download=async()=>{if(!pass)return;setDownloading(true);setError('');try{await attendanceApi.downloadPass(pass.profile.schoolId)}catch(e){setError(e instanceof Error?e.message:'Unable to download your QR code.')}finally{setDownloading(false)}}
  return <>
    <PageHeader eyebrow="My account" title="My permanent library QR" description="Use this same QR for library entry and desk services. Save it on your phone for offline display." action={<RefreshButton onRefresh={() => load()} variant="secondary" disabled={loading} />}/>
    {libraryStatus.closed?<NoticeBanner tone="warning">The library is currently closed ({libraryStatus.reason}). Attendance check-in is disabled until the library reopens.</NoticeBanner>:null}
    {error?<NoticeBanner tone="error">{error}</NoticeBanner>:null}
    {loading&&!pass?<SectionCard className="p-10 text-center text-sm font-medium text-[var(--sl-text-secondary)]">Preparing your permanent attendance pass…</SectionCard>:pass?<div className="grid gap-5 lg:grid-cols-[370px_1fr]">
      <SectionCard className="overflow-hidden"><div className="bg-[#0b5ea2] p-5 text-white"><div className="flex items-center gap-3"><div className="rounded-[8px] bg-white/12 p-2"><QrCode size={21}/></div><div><p className="font-display font-semibold">STI Library Pass</p><p className="text-xs text-white/75">One permanent QR for library services</p></div></div></div><div className="p-6 text-center"><p className="mb-4 text-sm text-[var(--sl-text-secondary)]">Show this QR at the entrance or service desk. Keep this account open when scanned so you can confirm your visit purpose and exit.</p>{qrUrl?<img src={qrUrl} alt="Permanent STI Library attendance QR code" className="mx-auto aspect-square w-56 rounded-[10px] border-8 border-white shadow-[var(--sl-shadow-m)] ring-1 ring-[var(--sl-border)]"/>:<div className="mx-auto aspect-square w-56 animate-pulse rounded-[10px] bg-[var(--sl-bg-subtle)]"/>}<p className="mt-5 font-display text-lg font-semibold text-[var(--sl-text-header)]">{pass.profile.name}</p><p className="mt-1 text-xs text-[var(--sl-text-secondary)]">{pass.profile.schoolId}{pass.profile.program?` · ${pass.profile.program}`:''}{pass.profile.section?` · ${pass.profile.section}`:''}</p><Button className="mt-5 w-full" onClick={download} disabled={downloading}><Download size={16}/>{downloading?'Preparing image…':'Download QR code'}</Button><p className="mt-3 text-xs leading-5 text-[var(--sl-text-muted)]">Keep this image private. If the school roster is refreshed or your QR is lost, refresh this page to save the latest code.</p></div></SectionCard>
      <div><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Visits this month" value={String(pass.summary.visitsThisMonth)} icon={LibraryBig} tone="info"/><StatCard label="Today's check-in" value={pass.summary.todayCheckIn?formatManilaTime12(pass.summary.todayCheckIn):'—'} icon={Clock3} tone="teal"/><StatCard label="Most common purpose" value={pass.summary.commonPurpose??'—'} icon={QrCode} tone="violet"/></div><SectionCard className="overflow-hidden"><div className="border-b border-[var(--sl-border)] px-5 py-4"><h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Attendance history</h2><p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">Your recent library visits</p></div><ResponsiveTable label="Attendance history"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"><tr>{['Date','Time in','Time out','Purpose','Status'].map(h=><th key={h} scope="col" className="px-5 py-3 text-xs">{h}</th>)}</tr></thead><tbody className="divide-y divide-[var(--sl-border)]">{pass.history.length?pass.history.map(item=><tr key={item.log_id}><td className="px-5 py-3.5 font-semibold text-[var(--sl-text-header)]">{formatPhDate(item.attendance_date, 'medium')}</td><td className="px-5 py-3.5 tabular-nums text-[var(--sl-text)]">{formatManilaTime12(item.time_in)}</td><td className="px-5 py-3.5 tabular-nums text-[var(--sl-text)]">{item.time_out?formatManilaTime12(item.time_out):'—'}{item.checkout_source==='Automatic closing'?<p className="text-xs text-[var(--sl-text-muted)]">Automatic closing checkout</p>:null}</td><td className="px-5 py-3.5 text-[var(--sl-text-secondary)]">{item.purpose==='Book Borrowing'?'Borrow books':item.purpose}</td><td className="px-5 py-3.5"><StatusBadge status={item.presence}/></td></tr>):<tr><td colSpan={5} className="p-10 text-center text-sm text-[var(--sl-text-muted)]">No attendance records yet.</td></tr>}</tbody></table></ResponsiveTable></SectionCard></div>
    </div>:null}
  </>
}
