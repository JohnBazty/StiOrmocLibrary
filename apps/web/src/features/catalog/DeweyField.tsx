import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { deweyApi, type DeweyResult, type DeweySelection } from './dewey-api'
import { isbnInputError, normalizeIsbnInput } from './isbn'

export function DeweyField({isbn,value,onChange,disabled=false}:{isbn:string;value:DeweySelection|null;onChange:(value:DeweySelection|null)=>void;disabled?:boolean}) {
  const id=useId(), normalized=normalizeIsbnInput(isbn)
  const [result,setResult]=useState<DeweyResult|null>(null),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0)
  const latest=useRef({value,onChange}), previousIsbn=useRef(normalized), edited=useRef(false)
  latest.current={value,onChange}
  useEffect(()=>{
    if(previousIsbn.current!==normalized){previousIsbn.current=normalized;edited.current=false;latest.current.onChange(null)}
    setResult(null)
    if(!normalized||isbnInputError(normalized)){setLoading(false);return}
    const controller=new AbortController()
    setLoading(true)
    const timer=window.setTimeout(()=>{
      void deweyApi.lookup(normalized,controller.signal).then(found=>{
        if(controller.signal.aborted)return
        setResult(found)
        if(!edited.current&&!latest.current.value?.code&&found.status==='matched')latest.current.onChange({code:found.candidates[0].code,source:'open_library',reviewed:false})
      }).catch(()=>{if(!controller.signal.aborted)setResult({isbn:normalized,status:'unavailable',candidates:[]})})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    },350)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[normalized,retry])
  const valid=!value?.code||/^\d{3}(\.\d+)?$/.test(value.code)&&value.code.length<=64
  const field='mt-1 min-h-11 w-full rounded-xl border border-[#003399]/30 bg-white px-3 py-2 text-sm text-[#003399] focus:ring-2 focus:ring-[#003399] dark:bg-[#001a4d] dark:text-white'
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-[#003399]/20 p-4 text-[#003399] dark:text-white">
    <legend className="px-1 font-semibold">Dewey classification (optional)</legend>
    <p className="text-sm">The Dewey number groups books by subject. Review it before saving; your call number and shelf stay unchanged.</p>
    <p role="status" className="text-sm">{loading?'Finding a Dewey number…':result?.status==='matched'?'Suggestion found from Open Library.':result?.status==='multiple'?'Open Library lists several numbers. Choose the correct one.':result?.status==='unavailable'?'Lookup is unavailable. Try again or enter a number manually.':result?.status==='not_found'?'No Dewey number found. Enter one manually or leave it unassigned.':'Enter a valid ISBN for automatic lookup, or enter a number manually.'}</p>
    {result?.status==='multiple'&&<label className="block text-sm" htmlFor={`${id}-choices`}>Choose a Dewey suggestion<select id={`${id}-choices`} className={field} value={value?.source==='open_library'?value.code:''} onChange={event=>{edited.current=true;onChange(event.target.value?{code:event.target.value,source:'open_library',reviewed:false}:null)}}><option value="">Choose a number</option>{result.candidates.map(candidate=><option key={candidate.code}>{candidate.code}</option>)}</select></label>}
    <label className="block text-sm" htmlFor={`${id}-code`}>Dewey number<input id={`${id}-code`} className={field} maxLength={64} value={value?.code??''} aria-invalid={!valid} aria-describedby={!valid?`${id}-error`:undefined} onChange={event=>{edited.current=true;onChange(event.target.value?{code:event.target.value,source:'manual',reviewed:false}:null)}}/></label>
    {!valid&&<p id={`${id}-error`} role="alert" className="text-sm">Use three digits and an optional decimal, such as 005.1.</p>}
    {value?.code&&<><p className="text-sm">Source: {value.source==='open_library'?'Open Library ISBN record':'Entered manually'}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={value.reviewed} disabled={!valid} onChange={event=>onChange({...value,reviewed:event.target.checked})}/>I reviewed this Dewey number</label><Button type="button" variant="secondary" onClick={()=>{edited.current=true;onChange(null)}}>Leave Dewey unassigned</Button></>}
    {result?.status==='unavailable'&&<Button type="button" variant="secondary" onClick={()=>setRetry(current=>current+1)}>Try Dewey lookup again</Button>}
  </fieldset>
}
