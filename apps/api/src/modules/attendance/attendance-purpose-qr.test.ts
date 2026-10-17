import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAttendanceQr, purposeAttendanceQr } from './attendance-credential.service.ts'

const base=`STILIB.ATTENDANCE.1.${'a'.repeat(16)}.${'b'.repeat(43)}`
const now=new Date('2026-10-11T02:00:00Z')
test('purpose QR is signed, expiring and retains the permanent credential identity',()=>{
 const qr=purposeAttendanceQr(base,'Book Borrowing',now)
 assert.equal(parseAttendanceQr(qr,now).purpose,'Book Borrowing')
 assert.equal(parseAttendanceQr(qr,now).publicId,parseAttendanceQr(base).publicId)
 assert.throws(()=>parseAttendanceQr(qr.replace('.3.', '.4.'),now))
 assert.throws(()=>parseAttendanceQr(qr,new Date(now.getTime()+900000)))
 assert.throws(()=>parseAttendanceQr(qr.replace('a'.repeat(16),'c'.repeat(16)),now))
 assert.equal(parseAttendanceQr(base).purpose,null)
})
