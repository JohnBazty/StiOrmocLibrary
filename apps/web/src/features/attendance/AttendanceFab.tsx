import { Camera, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AttendanceScannerModal } from './AttendanceScannerModal'

export function AttendanceFab({role}:{role:'student'|'faculty'|'admin'}){
  const navigate=useNavigate(),[scannerOpen,setScannerOpen]=useState(false)
  const isAdmin=role==='admin'
  return <><button type="button" onClick={()=>isAdmin?setScannerOpen(true):navigate(`/${role}/attendance`)} aria-label={isAdmin?'Scan attendance QR':'Show my attendance QR'} title={isAdmin?'Scan attendance':'My attendance QR'} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-14 items-center gap-2 rounded-full bg-[#FFF200] px-4 font-bold text-[#003399] shadow-xl ring-2 ring-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#003399]/25 sm:right-6"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003399] text-white">{isAdmin?<Camera size={19}/>:<QrCode size={19}/>}</span><span className="hidden sm:inline">{isAdmin?'Scan attendance':'My QR'}</span></button>{isAdmin?<AttendanceScannerModal open={scannerOpen} onClose={()=>setScannerOpen(false)}/>:null}</>
}
