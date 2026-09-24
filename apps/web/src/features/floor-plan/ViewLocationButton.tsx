import { MapPin } from 'lucide-react'
import { getCurrentIdentity } from '../auth/auth-storage'
export function ViewLocationButton({titleId,copyId,barcode,availableOnly=false}:{titleId:number;copyId?:number;barcode?:string|null;availableOnly?:boolean}){
  const role=getCurrentIdentity()?.role
  const prefix=role==='Faculty'?'/faculty':role==='Admin'?'/admin':role==='Librarian'?'/librarian':'/student'
  const params=new URLSearchParams({titleId:String(titleId)})
  if(copyId)params.set('copyId',String(copyId));else if(barcode)params.set('barcode',barcode)
  if(availableOnly)params.set('available','true')
  return <a href={`${prefix}/floor-plan?${params}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#003399]/20 bg-white px-3 py-2 text-xs font-bold text-[#003399] hover:bg-[#FFF200]"><MapPin size={15}/>View location</a>
}
