import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'

export type WorkspaceTasksData = { generatedAt:string; role:string; cards:Array<{label:string;value:number;path:string}>;
  pickups:Array<{id:number;title:string;borrower:string;deadline:string}>;
  operations:{state:string;capacity:number;serviceVisits:number;allowBorrowing:boolean;allowPrinting:boolean;events:Array<{title:string}>};enrollment:string }
export async function fetchWorkspaceTasks():Promise<WorkspaceTasksData> {
  const token=getAccessToken(), response=await fetch('/api/v1/workspace/tasks',{credentials:'include',headers:token?{Authorization:`Bearer ${token}`}:{}})
  const body=await response.json().catch(()=>null)
  if(!response.ok||!body?.success)throw new Error(body?.message??'Workspace tasks are unavailable.')
  return body.data
}
export function WorkspaceTasks(){
  const[data,setData]=useState<WorkspaceTasksData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const load=useCallback(async()=>{setLoading(true);setError('');try{setData(await fetchWorkspaceTasks())}catch(e){setError(e instanceof Error?e.message:'Tasks are unavailable.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  const prefix=data?.role==='Librarian'?'/librarian':'/staff'
  return <section className="mb-6 space-y-4" aria-labelledby="workspace-task-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest opacity-60">Your work today</p><h2 id="workspace-task-heading" className="text-xl font-bold">{data?.role==='Librarian'?'Tasks and account standing':data?'Desk tasks':'Your workspace'}</h2></div><Button variant="secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>{loading?'Loading tasks…':'Refresh tasks'}</Button></div>
    {error&&<p role="alert" className="rounded-xl bg-[#b42318] p-4 text-sm text-white">{error}{data?' Showing the last successfully loaded tasks.':''}</p>}
    {!data&&loading&&<p role="status">Loading live workspace tasks…</p>}
    {data&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.cards.map(card=><Link key={card.label} to={card.path} className="group rounded-2xl border border-[#0b5ea2]/15 bg-white p-4 transition hover:border-[#0b5ea2] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0b5ea2] dark:border-white/20 dark:bg-white/5"><div className="flex justify-between gap-3"><span className="text-sm font-semibold">{card.label}</span><ArrowUpRight className="shrink-0 opacity-60" size={18}/></div><p className="mt-2 text-3xl font-bold tabular-nums">{card.value.toLocaleString('en-PH')}</p><p className="mt-1 text-xs opacity-60">Open details</p></Link>)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><SectionCard className="p-5"><h3 className="font-bold">Library operating status</h3><p className="mt-2 text-lg font-semibold">{data.operations.state}</p><p className="mt-2 text-sm">{data.operations.capacity} seats in the operating layout · {data.operations.serviceVisits} printing-only visitors inside.</p><p className="mt-2 text-sm">Borrowing: {data.operations.allowBorrowing?'Open':'Paused'} · Printing: {data.operations.allowPrinting?'Open':'Paused'}</p>{data.operations.events?.map((e,i)=><p className="mt-1 text-sm" key={i}>{e.title}</p>)}<Link className="mt-3 inline-block font-bold underline" to={`${prefix}/attendance`}>View attendance and operating conditions</Link><p className="mt-3 text-xs opacity-65">{data.enrollment}</p></SectionCard>
      <SectionCard className="p-5"><h3 className="font-bold">Next pickup deadlines</h3>{data.pickups.length?<ul className="mt-3 divide-y divide-[#0b5ea2]/15 dark:divide-white/20">{data.pickups.map(p=><li key={p.id} className="py-3"><Link className="font-semibold underline" to={`${prefix}/reservations`}>{p.title}</Link><p className="text-sm opacity-70">{p.borrower} · Claim by {p.deadline} (Manila)</p></li>)}</ul>:<p className="mt-3 text-sm opacity-65">No unexpired ready pickups.</p>}</SectionCard></div>
      <p className="text-xs opacity-60">Tasks checked {new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · Asia/Manila</p>
    </>}
  </section>
}
