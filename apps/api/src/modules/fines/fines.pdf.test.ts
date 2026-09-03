import assert from 'node:assert/strict'
import test from 'node:test'
import { createFineReceiptPdf,receiptVerificationCode } from './fines.pdf.ts'

const receipt={receiptId:7,receiptNumber:'OR-20260902-000007',status:'Issued',amountReceived:24,paymentMethod:'Cash',receivedAt:'2026-09-02T10:00:00+08:00',receivedBy:'Library Admin',reversedBy:null,reversedAt:null,reversalReason:null,notes:null,student:{name:'Test Student',schoolId:'02000000001'},allocations:[{type:'Overdue',title:'Clean Code',assessed:24,paid:24,balanceBefore:24,balanceAfter:0}]}
test('digital receipt has a stable verification code and valid PDF header',async()=>{
  assert.equal(receiptVerificationCode(receipt),receiptVerificationCode(receipt))
  const chunks:Buffer[]=[];const pdf=createFineReceiptPdf(receipt);pdf.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));await new Promise<void>((resolve,reject)=>{pdf.on('end',resolve);pdf.on('error',reject)})
  const output=Buffer.concat(chunks);assert.equal(output.subarray(0,4).toString(),'%PDF');assert.ok(output.length>1000)
})
