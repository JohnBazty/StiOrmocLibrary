import {useEffect,useRef,useState} from 'react'
import type {LookupResult} from './stocktake-api'

export type ObservedCondition='good'|'fair'|'for_repair'|'damaged'
type Option={value:ObservedCondition;label:string;hint:(kind:'book'|'research')=>string}

const OPTIONS:Option[]=[
  {value:'good',label:'Good',hint:()=>'No problems. Only the count is recorded.'},
  {value:'fair',label:'Worn but usable',hint:()=>'Still fine to lend. Only the count is recorded.'},
  {value:'for_repair',label:'Damaged, can be repaired',hint:kind=>kind==='book'?'Marked For Repair and saved to Books in repair.':'Marked For Repair in research inventory.'},
  {value:'damaged',label:'Damaged beyond repair',hint:kind=>kind==='book'?'Marked Damaged and saved to Damaged copies.':'Marked Damaged and saved to Damaged research.'},
]
const conditionKey=(value:string)=>value.toLowerCase().replaceAll(' ','_')
const startingChoice=(current:string):ObservedCondition|null=>OPTIONS.find(option=>option.value===conditionKey(current))?.value??null
const looksLikeIsbn=(code:string)=>/^97[89]\d{10}$/.test(code)
const buttonClass='min-h-11 rounded-lg px-4 py-2 font-semibold disabled:opacity-50'

type Props={code:string;lookup:LookupResult|null;saving:boolean;error:string;onSave:(condition:ObservedCondition)=>void;onCancel:()=>void}

/** Pop-up shown after the camera reads a label: identify the copy, then choose its condition. */
export function StocktakeConditionDialog({code,lookup,saving,error,onSave,onCancel}:Props){
  const dialog=useRef<HTMLDivElement>(null)
  const [picked,setPicked]=useState<ObservedCondition|null>(null)
  const item=lookup?.found?lookup.item:null
  // Starts on the recorded condition, so confirming without a change records no change. A lost copy has no starting choice.
  const choice=picked??(item?startingChoice(item.condition):null)
  useEffect(()=>{dialog.current?.focus()},[lookup])

  const warnings=lookup?.found?[
    lookup.alreadyCounted&&'This copy was already counted. Saving again still counts it once.',
    !lookup.inScope&&"This copy is outside this count's scope. It will be recorded for review.",
    lookup.item.loan!=='none'&&'This copy is on loan or in use.',
    lookup.item.lifecycle!=='Active'&&'This copy is archived, so its inventory status will not be changed.',
    conditionKey(lookup.item.condition)==='lost'&&'This copy is recorded as lost. Saving records that it was found. Review its status in Inventory.',
  ].filter((text):text is string=>Boolean(text)):[]

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onKeyDown={event=>{if(event.key==='Escape'&&!saving){event.stopPropagation();onCancel()}}}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="stocktake-condition-title" className="max-h-[96dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl outline-none dark:bg-slate-900 dark:text-white">
      <h2 id="stocktake-condition-title" className="text-lg font-bold">{lookup&&!lookup.found?'Code not recognized':'Check the condition of this book'}</h2>
      {!lookup&&<p role="status" className="text-sm">Looking up {code}…</p>}
      {lookup&&!lookup.found&&<div className="space-y-2 text-sm">
        <p><strong>{code}</strong> is not in the library list.</p>
        {looksLikeIsbn(code)&&<p>This looks like a publisher ISBN. It identifies a title, not one copy. Scan the library copy label instead.</p>}
        <p>You can save it for review. Nothing in the inventory will change.</p>
      </div>}
      {item&&<div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
        <p className="font-bold">{item.title}</p>
        <p>Accession {item.accession} · Barcode {item.barcode}</p>
        <p>{item.shelf||'No shelf recorded'} · Recorded condition: <strong>{item.condition.replaceAll('_',' ')}</strong></p>
      </div>}
      {warnings.map(text=><p key={text} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{text}</p>)}
      {item&&<fieldset disabled={saving} className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">What condition is the book in now?</legend>
        {OPTIONS.map(option=><label key={option.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${choice===option.value?'border-[#0b5ea2] bg-[#0b5ea2]/10':'border-slate-300 dark:border-slate-600'}`}>
          <input type="radio" name="observed-condition" className="mt-1" checked={choice===option.value} onChange={()=>setPicked(option.value)}/>
          <span><strong className="block">{option.label}</strong><span className="text-xs">{option.hint(item.kind)}</span></span>
        </label>)}
      </fieldset>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={`${buttonClass} border border-slate-300 dark:border-slate-600`} disabled={saving} onClick={onCancel}>Scan another</button>
        {item&&<button type="button" className={`${buttonClass} bg-[#0b5ea2] text-white`} disabled={saving||!choice} onClick={()=>choice&&onSave(choice)}>{saving?'Saving…':'Save condition'}</button>}
        {/* The API requires a condition. It is ignored for unrecognized codes, which are only listed for review. */}
        {lookup&&!lookup.found&&<button type="button" className={`${buttonClass} bg-[#0b5ea2] text-white`} disabled={saving} onClick={()=>onSave('good')}>{saving?'Saving…':'Save for review'}</button>}
      </div>
    </div>
  </div>
}
