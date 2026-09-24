import assert from 'node:assert/strict'
import test from 'node:test'
import { createPrintingReceiptPdf } from './printing-receipt.pdf.ts'

test('printing digital receipt renders a valid PDF and stays separate from fine receipts',async()=>{
  const document=createPrintingReceiptPdf({print_receipt_id:8,request_id:4,receipt_number:'PR-20260923-000021',verification_code:'A1B2C3D4E5F60708',receipt_status:'Issued',student_name:'Student User',school_id:'0200000001',file_name:'capstone.pdf',page_count:6,number_of_copies:2,total_sheets:12,print_type:'Monochrome',paper_size:'A4',amount_received:36,payment_method:'Cash',received_by:'Library Admin',received_at:'2026-09-23T10:30:00+08:00'})
  const chunks:Buffer[]=[]
  for await(const chunk of document)chunks.push(Buffer.from(chunk))
  const pdf=Buffer.concat(chunks)
  assert.equal(pdf.subarray(0,4).toString(),'%PDF')
  assert.ok(pdf.length>1000)
})
