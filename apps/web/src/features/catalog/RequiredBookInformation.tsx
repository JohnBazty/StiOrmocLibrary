import {useEffect,useId,useRef,useState} from 'react'
import {Button} from '../../components/ui'
import {catalogApi} from './catalog-api'
import {isbnInputError,normalizeIsbnInput} from './isbn'
import type {IsbnMetadata,TitleCandidate} from './types'

export type RequiredBookDraft={title:string;author:string;isbn:string}
type Candidate=Pick<TitleCandidate,'title'|'author'|'isbn'|'publisher'|'publicationYear'>&{source:IsbnMetadata['source']}
const clean=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,255):''
export function requiredBookAdditions(draft:RequiredBookDraft,found:Pick<Candidate,'title'|'author'|'isbn'>,requireIsbn:boolean){
 const patch:Partial<RequiredBookDraft>={}
 for(const field of ['title','author'] as const)if(!draft[field].trim()&&clean(found[field]))patch[field]=clean(found[field])
 const isbn=normalizeIsbnInput(found.isbn??'')
 if(requireIsbn&&!draft.isbn.trim()&&isbn&&!isbnInputError(isbn))patch.isbn=isbn
 return patch
}
export function RequiredBookInformation({draft,onApply,disabled=false,requireIsbn=false}:{draft:RequiredBookDraft;onApply:(patch:Partial<RequiredBookDraft>)=>void;disabled?:boolean;requireIsbn?:boolean}){
 const candidateGroup=useId()
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]),[chosen,setChosen]=useState<Candidate|null>(null),[notice,setNotice]=useState('')
 const running=useRef(false),request=useRef(0),live=useRef(true),fingerprint=JSON.stringify(draft)
 useEffect(()=>{request.current++;setCandidates([]);setChosen(null);setError('');setNotice('')},[fingerprint])
 useEffect(()=>{live.current=true;return()=>{live.current=false;request.current++}},[])
 const missing=!draft.title.trim()||!draft.author.trim()||(requireIsbn&&!draft.isbn.trim())
 async function find(){
  if(running.current||disabled)return
  running.current=true;setBusy(true);setError('');setCandidates([]);setChosen(null);setNotice('');const id=++request.current
  try{
   let found:Candidate[]=[]
   if(draft.isbn.trim()){
    const isbn=normalizeIsbnInput(draft.isbn),invalid=isbnInputError(isbn)
    if(invalid)throw new Error(invalid)
    const result=await catalogApi.lookupIsbn(isbn)
    if(!result||normalizeIsbnInput(result.isbn)!==isbn)throw new Error('No exact ISBN match was found. Check the ISBN or enter the missing details yourself.')
    found=[{...result,source:result.source}]
   }else{
    if(!draft.title.trim()&&!draft.author.trim())throw new Error('Enter an ISBN, title or author first.')
    const result=await catalogApi.searchTitles(draft.title,draft.author)
    found=[...result.localMatches.map(book=>({...book,publisher:null,publicationYear:null,source:'local_catalog' as const})),...result.candidates.map(book=>({...book,source:result.source??'open_library' as const}))].slice(0,20)
   }
   if(!live.current||id!==request.current)return
   setCandidates(found)
   if(draft.isbn.trim()&&found.length===1)setChosen(found[0])
   if(!found.length)setNotice('No matching book was found. Enter the missing required details yourself.')
  }catch(e){if(live.current&&id===request.current)setError(e instanceof Error?e.message:'Book lookup is unavailable. Try again or enter the details yourself.')}
  finally{running.current=false;if(live.current)setBusy(false)}
 }
 const patch=chosen?requiredBookAdditions(draft,chosen,requireIsbn):{}
 const conflicts=chosen?(['title','author'] as const).filter(field=>draft[field].trim()&&clean(chosen[field])&&draft[field].trim().toLocaleLowerCase()!==clean(chosen[field]).toLocaleLowerCase()):[]
 return <section aria-label="Fill missing required book information" className="space-y-3 rounded-xl border border-[#0b5ea2]/20 p-4 text-[#0b5ea2] sm:col-span-2">
  <Button type="button" variant="secondary" disabled={disabled||busy||!missing} onClick={()=>void find()}>{busy?'Looking up required information…':'Auto-fill missing required information'}</Button>
  <p className="text-xs">Review the matching book before applying. Entered values and optional blanks are kept. Choose the category, shelf and number of copies yourself.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!!candidates.length&&!draft.isbn.trim()&&<div className="space-y-2"><p>Choose the correct book and edition:</p>{candidates.map((book,index)=><label key={index} className="flex gap-2 rounded-lg border p-2 text-sm"><input type="radio" name={candidateGroup} disabled={disabled||busy} checked={chosen===book} onChange={()=>setChosen(book)}/><span>{book.title} · {book.author||'Author unavailable'}<br/>{book.isbn??'ISBN unavailable'} · {book.publisher??'Publisher unavailable'} · {book.publicationYear??'Year unavailable'}</span></label>)}</div>}
  {chosen&&<div className="space-y-2 text-sm"><p className="font-semibold">Source: {chosen.source==='local_catalog'?'Library catalog':chosen.source==='google_books'?'Google Books':'Open Library'}</p><p>{chosen.title} · {chosen.author} · {chosen.isbn??'ISBN unavailable'}</p>{conflicts.length>0&&<p role="alert">The found {conflicts.join(' and ')} differs from your entry. Your entry will be kept. Verify the edition before continuing.</p>}{Object.keys(patch).length?<><ul>{Object.entries(patch).map(([field,value])=><li key={field}>{field==='isbn'?'ISBN':field==='title'?'Title':'Author'}: {value}</li>)}</ul><Button type="button" disabled={disabled||busy} onClick={()=>{onApply(patch);setChosen(null);setCandidates([]);setNotice('Required details applied to the draft. Check any remaining required fields before saving.')}}>Apply required details to draft</Button></>:<p>No missing required information is available from this match. Enter the remaining details yourself.</p>}</div>}
 </section>
}
