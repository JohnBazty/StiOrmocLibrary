import PDFDocument from 'pdfkit'
import { SYSTEM_NAME } from '../../config/branding.ts'
import type { AssuranceAttempt } from './payment-assurance.service.ts'

type Record=AssuranceAttempt&{payerName:string;schoolId:string}
const money=(value:number)=>`PHP ${(value/100).toFixed(2)}`
const time=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
/** Provider evidence only: this document creates neither a school receipt nor a new bill allocation. */
export function createProviderPaymentRecordPdf(record:Record){
 const pdf=new PDFDocument({size:'A4',margin:42}),blue='#003399',width=pdf.page.width-84
 pdf.rect(0,0,pdf.page.width,100).fill(blue)
 pdf.fillColor('white').font('Helvetica-Bold').fontSize(12).text(SYSTEM_NAME,42,25,{width})
 pdf.fontSize(18).text('Payment record',42,49,{width})
 pdf.font('Helvetica').fontSize(9).text('Xendit confirmation · Not a tax invoice',42,77,{width})
 let y=128
 const details:[string,string][]=[['Status','Payment successful'],['User',record.payerName],['School ID',record.schoolId],['Print request',`#${record.targetId}`],['Payment method','GCash'],['Payment ID',record.paymentId],['Provider reference',record.providerPaymentId??''],['Created',time(record.createdAt)]]
 if(record.confirmedAt)details.push(['Confirmation checked',time(record.confirmedAt)])
 for(const[label,value]of details){
  pdf.fillColor(blue).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(),42,y,{width:150})
  const valueY=y;pdf.font('Helvetica').fontSize(10).text(value,204,valueY,{width:width-162})
  y=Math.max(y+32,pdf.y+15)
 }
 y+=12
 const totals:[string,number][]=[['Printing amount',record.principalCentavos],['Transaction fee',record.feeCentavos],['Total payment',record.totalCentavos]]
 for(const[label,value]of totals){
  pdf.fillColor(blue).font(label==='Total payment'?'Helvetica-Bold':'Helvetica').fontSize(label==='Total payment'?15:11)
  pdf.text(label,42,y,{width:width/2}).text(money(value),42+width/2,y,{width:width/2,align:'right'})
  y+=label==='Total payment'?36:28
 }
 pdf.moveTo(42,y+10).lineTo(pdf.page.width-42,y+10).strokeColor('#dce6f3').stroke()
 pdf.fillColor('#526478').font('Helvetica').fontSize(9).text('This records the provider-confirmed transaction. The school bill, allocations and any later refund remain available in the library transaction history.',42,y+26,{width,lineGap:4})
 pdf.end();return pdf
}
