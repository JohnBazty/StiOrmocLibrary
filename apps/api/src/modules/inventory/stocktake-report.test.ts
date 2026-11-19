import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildStocktakeReport,type StockItem} from './stocktake-report.ts'
const item:StockItem={kind:'book',id:1,barcode:'000123',accession:'A1',title:'Test book',shelf:'A',column:1,row:1,condition:'Good',availability:'Available',lifecycle:'Active',version:1,loan:'none',reservation:'none',categoryId:null,category:null}
test('counts physical items once and reports location and unknown exceptions',()=>{
 const scan={id:1,code:'000123',codeType:'barcode' as const,kind:'book' as const,itemId:1,shelf:'B',item}
 const r=buildStocktakeReport([{id:1,item}],[scan,{...scan,id:2},{...scan,id:3,kind:null,itemId:null,item:null}],[item])
 assert.equal(r.summary.found,1);assert.equal(r.summary.duplicates,1);assert.equal(r.summary.unknown,1)
 assert(r.findings.some(f=>f.code==='wrong_location'))
})
test('active loans are never unchecked loss and mid-count returns are reconciled',()=>{
 const borrowed={...item,loan:'borrowed',availability:'Borrowed'}
 assert.equal(buildStocktakeReport([{id:1,item:borrowed}],[],[borrowed]).summary.notChecked,0)
 const returned=buildStocktakeReport([{id:1,item:borrowed}],[],[{...item,version:2}])
 assert.equal(returned.summary.notChecked,1);assert.equal(returned.summary.changed,1)
 assert.equal(returned.rows[0].outcome,'Not yet checked')
})
test('research, known lost, damaged, archived and out-of-scope scans stay distinct',()=>{
 const research={...item,kind:'research' as const,id:2,condition:'damaged'}
 const lost={...item,id:3,condition:'Lost'}
 const archived={...item,id:4,lifecycle:'Archived'}
 const r=buildStocktakeReport([item,research,lost,archived].map((item,i)=>({id:i+1,item})),[],[item,research,lost,archived])
 assert.equal(r.summary.expected,4);assert.equal(r.summary.knownLost,1);assert.equal(r.summary.damaged,1);assert.equal(r.summary.archived,1)
})
test('records observed conditions and conflicting rescans without changing the inventory item',()=>{
 const scan={id:1,code:'000123',codeType:'barcode' as const,kind:'book' as const,itemId:1,shelf:'A',item,condition:'damaged'}
 const r=buildStocktakeReport([{id:1,item}],[scan,{...scan,id:2,condition:'for_repair'}],[item])
 assert.equal(r.rows[0].observedCondition,'for_repair');assert.equal(r.rows[0].item.condition,'Good')
 assert(r.findings.some(f=>f.code==='condition_conflict'));assert(r.findings.some(f=>f.code==='condition_observed'))
})
