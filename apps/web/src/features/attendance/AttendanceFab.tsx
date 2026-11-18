import { Camera, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AttendanceScannerModal } from './AttendanceScannerModal'

export function AttendanceFab({role}:{role:'student'|'faculty'|'librarian'|'staff'}){
  const navigate=useNavigate(),[scannerOpen,setScannerOpen]=useState(false)
  const isAdmin=role==='librarian'||role==='staff'
  return <><button type="button" onClick={()=>isAdmin?setScannerOpen(true):navigate(`/${role}/attendance`)} aria-label={isAdmin?'Scan attendance QR':'Show my attendance QR'} title={isAdmin?'Scan attendance':'My attendance QR'} className="mx-4 mb-4 flex h-14 w-fit sm:fixed sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-6 sm:z-30 sm:mx-0 sm:mb-0 items-center gap-2 rounded-full bg-[#FFF200] px-4 font-bold text-[#0b5ea2] shadow-xl ring-2 ring-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#0b5ea2]/25"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b5ea2] text-white">{isAdmin?<Camera size={19}/>:<QrCode size={19}/>}</span><span className="inline">{isAdmin?'Scan attendance':'My QR'}</span></button>{isAdmin?<AttendanceScannerModal open={scannerOpen} onClose={()=>setScannerOpen(false)}/>:null}</>
}
