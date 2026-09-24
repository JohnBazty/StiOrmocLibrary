import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { issueAttendanceCredential, parseAttendanceQr } from './attendance-credential.service.ts'

test('issues an opaque permanent QR without embedding personal data',async()=>{
  const writes:string[]=[]
  const database={execute:async(sql:string)=>{writes.push(sql);if(sql.includes('SELECT credential_id'))return[[]];return[{insertId:44}]}} as never
  const pass=await issueAttendanceCredential(database,19)
  assert.match(pass.payload,/^STILIB\.ATTENDANCE\.1\./)
  assert.equal(pass.payload.includes('student'),false)
  assert.equal(parseAttendanceQr(pass.payload).publicId,pass.publicId)
  assert.equal(writes.some(sql=>sql.includes('INSERT INTO attendance_qr_credentials')),true)
})

test('rejects arbitrary and malformed QR payloads',()=>{
  assert.throws(()=>parseAttendanceQr('02000871654'),(error:unknown)=>error instanceof HttpError&&error.code==='ATTENDANCE_QR_INVALID')
})
