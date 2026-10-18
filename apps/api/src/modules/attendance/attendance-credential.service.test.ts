import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, createHmac } from 'node:crypto'
import { HttpError } from '../../core/http-error.ts'
import { env } from '../../config/env.js'
import { issueAttendanceCredential, parseAttendanceQr } from './attendance-credential.service.ts'

// Mirrors the server's secret derivation so a mock row can hold a hash that
// matches (or deliberately does not match) the current ATTENDANCE_QR_SECRET.
const hashFor = (publicId: string, userId: number, version: number) => {
  const secret = createHmac('sha256', env.attendanceQr.secret).update(`${publicId}:${userId}:${version}`).digest('base64url')
  return createHash('sha256').update(secret, 'utf8').digest()
}

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

test('repeated requests and sign-in sessions reuse the same permanent credential without writes',async()=>{
  let updates=0
  const database={execute:async(sql:string)=>{if(!sql.startsWith('SELECT'))updates++;return [[{credential_id:4,user_id:19,public_id:'permanentpublicid1234',credential_version:1,issued_at:'2026-10-01',credential_status:'Active',secret_hash:hashFor('permanentpublicid1234',19,1)}]]}} as never
  const first=await issueAttendanceCredential(database,19)
  const nextSession=await issueAttendanceCredential(database,19)
  assert.equal(first.payload,nextSession.payload)
  assert.equal(first.credentialId,nextSession.credentialId)
  assert.equal(parseAttendanceQr(first.payload).purpose,null)
  assert.equal(updates,0)
})

test('re-issues when the stored hash no longer matches the current secret',async()=>{
  const writes:string[]=[]
  const database={execute:async(sql:string)=>{writes.push(sql);if(sql.startsWith('SELECT'))return[[{credential_id:4,user_id:19,public_id:'stalepublicid123456',credential_version:1,issued_at:'2026-10-01',credential_status:'Active',secret_hash:Buffer.alloc(32)}]];return[{insertId:4}]}} as never
  const pass=await issueAttendanceCredential(database,19)
  assert.equal(writes.some(sql=>sql.includes('UPDATE attendance_qr_credentials')),true)
  assert.notEqual(parseAttendanceQr(pass.payload).publicId,'stalepublicid123456')
})
