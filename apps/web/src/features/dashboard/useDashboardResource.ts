import { useEffect, useState } from 'react'

/** Refresh in place; interval ticks never overlap or reset the desk's form state. */
export function useDashboardResource<T>(load:(signal:AbortSignal)=>Promise<T>,refreshKey:number){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{
  let active=true,running=false;const controller=new AbortController()
  async function refresh(){if(running)return;running=true;setLoading(true);try{const result=await load(controller.signal);if(active){setData(result);setError('')}}catch(cause){if(active&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Refresh failed.')}finally{running=false;if(active)setLoading(false)}}
  void refresh();const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},30000)
  return ()=>{active=false;controller.abort();clearInterval(interval)}
 },[load,refreshKey])
 return {data,error,loading}
}
