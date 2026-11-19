import {Router} from 'express'
import {fileURLToPath} from 'node:url'
import {createStocktakeService,stocktakeId} from './stocktake.service.ts'
import {inventoryActor} from './inventory-actor.ts'
import {createBrandedTablePdf} from '../reports/branded-table-pdf.ts'
import type {StocktakeReport} from './stocktake-report.ts'

export function stocktakeExportRows(report:StocktakeReport){return [
 ...report.rows.map(r=>({kind:r.original.kind,accession:r.original.accession,barcode:r.original.barcode,title:r.original.title,location:r.item.shelf,outcome:r.outcome,condition:r.item.condition+(r.observedCondition?' | Observed: '+r.observedCondition.replaceAll('_',' '):''),scans:String(r.scans),notes:report.findings.filter(f=>f.expectedId===r.expectedId).map(f=>f.label).join('; ')})),
 ...report.findings.filter(f=>f.expectedId===null).map(f=>{const e=f.evidence as {code?:string;item?:{title?:string};shelf?:string};return {kind:'exception',accession:'',barcode:e.code??'',title:e.item?.title??'',location:e.shelf??'',outcome:f.label,condition:'',scans:'1',notes:f.label}}),
]}
const csvCell=(v:unknown)=>{const s=String(v??'');return '"'+(/^\s*[=+\-@]|^[\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'}
export function createStocktakeRouter(service=createStocktakeService()){
const stocktakeRouter=Router()
stocktakeRouter.get('/',async(_req,res,next)=>{try{res.json({success:true,data:await service.list()})}catch(e){next(e)}})
stocktakeRouter.get('/locations',async(_req,res,next)=>{try{res.json({success:true,data:await service.locations()})}catch(e){next(e)}})
stocktakeRouter.post('/',async(req,res,next)=>{try{res.status(201).json({success:true,data:await service.start(req.body??{},inventoryActor(req,res))})}catch(e){next(e)}})
stocktakeRouter.get('/:id',async(req,res,next)=>{try{res.json({success:true,data:await service.get(stocktakeId(req.params.id))})}catch(e){next(e)}})
for(const action of ['scan','finish','cancel'] as const)stocktakeRouter.post(`/:id/${action}`,async(req,res,next)=>{try{res.json({success:true,data:await service[action](stocktakeId(req.params.id),req.body??{},inventoryActor(req,res))})}catch(e){next(e)}})
stocktakeRouter.get('/:id/export.:format',async(req,res,next)=>{try{
 const id=stocktakeId(req.params.id),data=await service.get(id),rows=stocktakeExportRows(data.report)
 const summary=Object.entries(data.report.summary).map(([key,value])=>`${key}: ${value}`).join(' | ')
 const caption=`${data.session.session_name} | ${data.session.asset_kind} | ${data.session.scope_label} | ${data.session.status} | ${data.report.generatedAt} | ${summary}`
 if(req.params.format==='csv'){const headers=['kind','accession','barcode','title','location','outcome','condition','scans','notes'] as const;res.setHeader('Content-Disposition',`attachment; filename="stocktake-${id}.csv"`);return res.type('text/csv').send('\uFEFF'+[csvCell(caption),headers.map(csvCell).join(','),...rows.map(row=>headers.map(key=>csvCell(row[key])).join(','))].join('\r\n'))}
 if(req.params.format!=='pdf')return res.status(404).json({success:false,message:'Choose CSV or PDF.'})
 res.setHeader('Content-Disposition',`attachment; filename="stocktake-${id}.pdf"`);res.type('application/pdf')
 const pdf=createBrandedTablePdf((async function*(){yield* rows})(),{title:'Stocktake physical item report',subtitle:caption,emptyMessage:'No physical items in this count.',fonts:{regular:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),bold:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Bold.ttf',import.meta.url))},columns:[{key:'kind',label:'Collection',width:60},{key:'accession',label:'Accession',width:110},{key:'barcode',label:'Barcode',width:120},{key:'title',label:'Title',width:200},{key:'location',label:'Location',width:85},{key:'outcome',label:'Result',width:110},{key:'condition',label:'Condition',width:75},{key:'scans',label:'Scans',width:40},{key:'notes',label:'Review findings',width:220}]});pdf.on('error',next);pdf.pipe(res)
}catch(e){next(e)}})
return stocktakeRouter
}
export const stocktakeRouter=createStocktakeRouter()
