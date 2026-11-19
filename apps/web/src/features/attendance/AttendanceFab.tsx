import { BookOpen, Camera, QrCode } from 'lucide-react'
import {lazy,Suspense,useState} from 'react'
import { useNavigate } from 'react-router-dom'
import { AttendanceScannerModal } from './AttendanceScannerModal'

const CirculationQuickAction=lazy(()=>import('../circulation/CirculationQuickAction').then(m=>({default:m.CirculationQuickAction})))

// Archived at the owner's request; retain the shortcut implementation for later use.
const showCirculationShortcut = false

export function AttendanceFab({role}:{role:'student'|'faculty'|'librarian'|'staff'}){
  const navigate=useNavigate(),[scannerOpen,setScannerOpen]=useState(false),[circulationOpen,setCirculationOpen]=useState(false)
  const isAdmin=role==='librarian'||role==='staff'
  const pill='flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#0b5ea2]/20 px-3 text-sm font-semibold shadow-sm focus:outline-none focus:ring-4 focus:ring-[#0b5ea2]/25 dark:border-white/25'
  return <><div className="mx-4 mb-4 flex w-fit flex-col items-end gap-3 sm:fixed sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-6 sm:z-30 sm:mx-0 sm:mb-0">
   {showCirculationShortcut&&isAdmin&&<button type="button" aria-label="Borrow or return books" onClick={()=>{setScannerOpen(false);setCirculationOpen(true)}} className={pill+' bg-[#0b5ea2] text-white'}><BookOpen size={22} aria-hidden="true"/><span>Borrow / Return</span></button>}
   <button type="button" onClick={()=>{if(isAdmin){setCirculationOpen(false);setScannerOpen(true)}else navigate(`/${role}/attendance`)}} aria-label={isAdmin?'Scan attendance QR':'Show my attendance QR'} title={isAdmin?'Scan attendance':'My attendance QR'} className={pill+' bg-white text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white'}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-white/10 dark:text-white">{isAdmin?<Camera size={19}/>:<QrCode size={19}/>}</span><span>{isAdmin?'Scan attendance':'My QR'}</span></button>
  </div>{isAdmin&&scannerOpen?<AttendanceScannerModal open onClose={()=>setScannerOpen(false)}/>:null}{isAdmin&&circulationOpen?<Suspense fallback={<p role="status" className="fixed bottom-36 right-6 z-40 rounded-xl bg-white p-3 text-slate-950">Opening borrowing shortcut…</p>}><CirculationQuickAction onClose={()=>setCirculationOpen(false)}/></Suspense>:null}</>
}
