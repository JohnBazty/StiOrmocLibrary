import PDFDocument from 'pdfkit'
import type { Request, Response, NextFunction } from 'express'
import { conductService } from './conduct.service.ts'

const csv=(value:unknown)=>`"${String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')}"`
export function conductExport(req:Request,res:Response,next:NextFunction){void (async()=>{
 if(!['csv','pdf'].includes(String(req.params.format))){res.sendStatus(404);return}
 const user=res.locals.authenticatedUser
 const data=await conductService.list({accountId:user?.accountId??user?.id,role:user?.role},{...req.query,export:true})
 res.set('Cache-Control','private, no-store')
 if(req.params.format==='csv'){
   const rows=[['Person','School ID','Category','Incident time (Philippines)','Action','Case','Fine amount','Payment status','Details'],...data.items.map(i=>[i.full_name,i.school_id,i.category,new Date(i.incident_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}),i.action,i.voided_at?'Voided':i.events?.some((e:{type:string})=>e.type==='Resolved')?'Resolved':'Recorded',i.fine_amount??'',i.payment_status??'No charge',i.details])]
   res.type('text/csv').attachment('violations-records.csv').send('\uFEFF'+rows.map(r=>r.map(csv).join(',')).join('\r\n'));return
 }
 const pdf=new PDFDocument({margin:40,size:'A4'})
 res.type('application/pdf').attachment('violations-records.pdf')
 pdf.on('error',e=>res.destroy(e));pdf.pipe(res)
 pdf.fontSize(18).text('Library violations records').moveDown()
 pdf.fontSize(10).text('Warnings are separate from financial charges. Paid fines remain in history.').text(`Generated: ${new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`).text(`Filters: ${JSON.stringify(req.query)}`).moveDown()
 for(const i of data.items){if(pdf.y>690)pdf.addPage();pdf.fontSize(11).text(`${i.full_name} (${i.school_id}) - ${i.category}`,{lineGap:2}).fontSize(10).text(`${new Date(i.incident_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} | ${i.action}${i.voided_at?' | Voided':''}`).text(i.fine_amount?`Assessed PHP ${Number(i.fine_amount).toFixed(2)} | ${i.payment_status}`:'Warning: no charge').text(String(i.details)).moveDown()}
 if(!data.items.length)pdf.text('No matching records.')
 pdf.end()
 })().catch(next)}
