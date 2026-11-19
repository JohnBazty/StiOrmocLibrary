export type StockItem={kind:'book'|'research';id:number;barcode:string;accession:string;title:string;shelf:string;column:number;row:number;condition:string;availability:string;lifecycle:string;version:number;loan:string;reservation:string;categoryId:number|null;category:string|null}
export type CountScan={id:number;code:string;codeType:'barcode'|'accession';kind:StockItem['kind']|null;itemId:number|null;shelf:string;item:StockItem|null;condition?:string|null;applied?:{condition:string;version:number}|null}
export type CountExpected={id:number;item:StockItem}
export type Finding={key:string;code:string;label:string;expectedId:number|null;scanId:number|null;evidence:unknown}
const key=(item:Pick<StockItem,'kind'|'id'>)=>`${item.kind}:${item.id}`
export function buildStocktakeReport(expected:CountExpected[],scans:CountScan[],current:StockItem[]){
 const live=new Map(current.map(item=>[key(item),item])),wanted=new Set(expected.map(e=>key(e.item))),seen=new Map<string,CountScan[]>(),findings:Finding[]=[]
 let unknown=0,unexpected=0,duplicates=0
 for(const scan of scans){
  if(scan.kind&&scan.itemId){const k=`${scan.kind}:${scan.itemId}`;const group=seen.get(k)??[];if(group.length)duplicates++;group.push(scan);seen.set(k,group)
   if(!wanted.has(k)&&group.length===1){unexpected++;findings.push({key:`unexpected:${k}`,code:'unexpected',label:scan.item?.lifecycle!=='Active'?'Archived item scanned':'Item outside the count scope',expectedId:null,scanId:scan.id,evidence:scan})}
  }else{unknown++;findings.push({key:`unknown:${scan.id}`,code:'unknown',label:'Unrecognized code',expectedId:null,scanId:scan.id,evidence:scan})}
 }
 const rows=expected.map(entry=>{
  const original=entry.item,item=live.get(key(original))??{...original,lifecycle:'No longer recorded'},observed=seen.get(key(original))??[]
  const onLoan=item.loan!=='none',lost=item.condition.toLowerCase()==='lost',archived=item.lifecycle!=='Active'
  const outcome=archived?'Archived':onLoan?'On loan / in use':lost?'Known lost':observed.length?'Found':'Not yet checked'
  const applied=observed.map(scan=>scan.applied).filter(Boolean).at(-1),base=applied?{...original,condition:applied.condition,version:applied.version}:original;const changed=item.version!==base.version||item.shelf!==base.shelf||item.loan!==base.loan||item.lifecycle!==base.lifecycle||item.condition!==base.condition||item.title!==base.title // a condition change made by this count is not a surprise change
  function finding(code:string,label:string,evidence:unknown,scanId:number|null=null){findings.push({key:`${code}:${key(original)}`,code,label,expectedId:entry.id,scanId,evidence})}
  if(outcome==='Not yet checked')finding('not_checked','Physical check needed; loss is not established',{original,current:item})
  if(changed)finding('changed','Record or circulation changed during the count',{original,current:item})
  const misplaced=observed.filter(scan=>scan.shelf!==item.shelf)
  if(misplaced.length)finding('wrong_location','Scanned at another location',{current:item,scans:misplaced},misplaced[0].id)
  if(observed.length&&onLoan)finding('loan_scan','Scanned item still has a loan / in-library use',{current:item,scans:observed},observed[0].id)
  if(observed.length&&lost)finding('lost_scan','Known lost item was scanned; verify before restoring it',{current:item,scans:observed},observed[0].id)
  const conditions=[...new Set(observed.map(scan=>scan.condition).filter((c):c is string=>!!c))]
  const observedCondition=conditions.at(-1)??null
  if(conditions.length>1)finding('condition_conflict','Different conditions recorded; check this item again',{current:item,scans:observed})
  if(observedCondition&&observedCondition!==item.condition.toLowerCase().replaceAll(' ','_'))finding('condition_observed','Observed condition differs from the inventory record; review before changing it',{current:item,observedCondition,scans:observed})
  return {expectedId:entry.id,original,item,outcome,scans:observed.length,observedCondition,changed,damaged:['damaged','for_repair','for repair'].includes(item.condition.toLowerCase())}
 })
 const summary={expected:rows.length,found:rows.filter(r=>r.outcome==='Found').length,notChecked:rows.filter(r=>r.outcome==='Not yet checked').length,onLoan:rows.filter(r=>r.outcome==='On loan / in use').length,knownLost:rows.filter(r=>r.outcome==='Known lost').length,archived:rows.filter(r=>r.outcome==='Archived').length,damaged:rows.filter(r=>r.damaged).length,scanned:rows.filter(r=>r.scans>0).length,unknown,unexpected,duplicates,changed:rows.filter(r=>r.changed).length}
 return {summary,rows,findings,generatedAt:new Date().toISOString()}
}
export type StocktakeReport=ReturnType<typeof buildStocktakeReport>
