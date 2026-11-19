export const ATTENDANCE_UPDATED='smartlib:attendance-updated'
export function notifyAttendanceUpdated(){
  window.dispatchEvent(new Event(ATTENDANCE_UPDATED))
  window.dispatchEvent(new Event('smartlib:circulation-updated'))
  try{localStorage.setItem(ATTENDANCE_UPDATED,`${Date.now()}:${Math.random()}`)}catch{/* Same-tab refresh still works without storage. */}
}
import { useEffect, useRef } from 'react'


export function useAttendanceRefresh(refresh:()=>unknown|Promise<unknown>){
  const latest=useRef(refresh)
  latest.current=refresh
  useEffect(()=>{
    let running=false,queued=false,active=true
    const changed=async()=>{
      if(document.hidden||!active)return
      if(running){queued=true;return}
      running=true
      try{do{queued=false;await latest.current()}while(queued&&active&&!document.hidden)}
      finally{running=false}
    }
    const event=()=>{void changed()}
    const storage=(value:StorageEvent)=>{if(value.key===ATTENDANCE_UPDATED)event()}
    window.addEventListener(ATTENDANCE_UPDATED,event);window.addEventListener('storage',storage)
    return()=>{active=false;window.removeEventListener(ATTENDANCE_UPDATED,event);window.removeEventListener('storage',storage)}
  },[])
}
