import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Clock3, Download, LibraryBig, QrCode, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard } from '../../components/ui'
import { attendanceApi, type AttendancePass } from './attendance-api'

export function UserAttendancePage() {
  const [pass,setPass]=useState<AttendancePass|null>(null)
  const [qrUrl,setQrUrl]=useState('')
  const [loading,setLoading]=useState(true)
  const [downloading,setDownloading]=useState(false)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{setLoading(true);setError('');try{const[data,blob]=await Promise.all([attendanceApi.myPass(),attendanceApi.passImage()]);setPass(data);setQrUrl(old=>{if(old)URL.revokeObjectURL(old);return URL.createObjectURL(blob)})}catch(e){setError(e instanceof Error?e.message:'Unable to load your attendance pass.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>()=>{if(qrUrl)URL.revokeObjectURL(qrUrl)},[qrUrl])
  const download=async()=>{if(!pass)return;setDownloading(true);setError('');try{await attendanceApi.downloadPass(pass.profile.schoolId)}catch(e){setError(e instanceof Error?e.message:'Unable to download your QR code.')}finally{setDownloading(false)}}
  return <>
    <PageHeader eyebrow="My account" title="My permanent library QR" description="Use this same QR for library entry and desk services. It stays the same when you sign out and sign in again. Save it on your phone for offline display." action={<Button variant="secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>Refresh</Button>}/>
    <p className="mb-5 text-sm opacity-70">Your QR stays the same across library services and sign-ins. Save it on your phone for offline display.</p>
    {error?<div className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#0b5ea2]">{error}</div>:null}
    {loading&&!pass?<SectionCard className="p-10 text-center font-semibold">Preparing your permanent attendance pass…</SectionCard>:pass?<div className="grid gap-5 lg:grid-cols-[370px_1fr]">
      <SectionCard className="overflow-hidden"><div className="bg-[#0b5ea2] p-5 text-white"><div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-2"><QrCode size={21}/></div><div><p className="font-display font-bold">STI Library Pass</p><p className="text-xs text-white/65">One permanent QR for library services</p></div></div></div><div className="p-6 text-center"><p className="mb-4 text-sm">Show this QR when staff need to identify you. Staff select the service or visit purpose.</p>{qrUrl?<img src={qrUrl} alt="Permanent STI Library attendance QR code" className="mx-auto aspect-square w-56 rounded-xl border-8 border-white shadow-lg ring-1 ring-[#0b5ea2]/15"/>:<div className="mx-auto aspect-square w-56 animate-pulse rounded-xl bg-[#0b5ea2]/5"/>}<p className="mt-5 font-display text-lg font-bold">{pass.profile.name}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">{pass.profile.schoolId}{pass.profile.program?` · ${pass.profile.program}`:''}{pass.profile.section?` · ${pass.profile.section}`:''}</p><Button className="mt-5 w-full" onClick={download} disabled={downloading}><Download size={16}/>{downloading?'Preparing image…':'Download QR code'}</Button><p className="mt-3 text-xs leading-5 text-[#0b5ea2]/65">Keep this image private. If it is copied or lost, ask the library to replace it.</p></div></SectionCard>
      <div><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Visits this month" value={String(pass.summary.visitsThisMonth)} icon={LibraryBig}/><StatCard label="Today's check-in" value={pass.summary.todayCheckIn??'—'} icon={Clock3}/><StatCard label="Most common purpose" value={pass.summary.commonPurpose??'—'} icon={QrCode}/></div><SectionCard><div className="border-b border-[#0b5ea2]/15 p-5"><h2 className="font-display font-bold">Attendance history</h2><p className="mt-1 text-xs text-[#0b5ea2]/65">Your recent library visits</p></div><ResponsiveTable><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#0b5ea2] text-white"><tr>{['Date','Time in','Time out','Purpose','Status'].map(h=><th key={h} className="px-5 py-3 text-xs">{h}</th>)}</tr></thead><tbody>{pass.history.length?pass.history.map(item=><tr key={item.log_id} className="border-b border-[#0b5ea2]/10"><td className="px-5 py-4 font-semibold">{item.attendance_date}</td><td className="px-5 py-4">{item.time_in}</td><td className="px-5 py-4">{item.time_out??'—'}{item.checkout_source==='Automatic closing'?<p className="text-xs">Automatic closing checkout</p>:null}</td><td className="px-5 py-4">{item.purpose==='Book Borrowing'?'Borrow books':item.purpose}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.presence==='Inside'?'bg-[#FFF200]':'border border-[#0b5ea2]/20'}`}>{item.presence}</span></td></tr>):<tr><td colSpan={5} className="p-10 text-center font-semibold">No attendance records yet.</td></tr>}</tbody></table></ResponsiveTable></SectionCard></div>
    </div>:null}
  </>
}
