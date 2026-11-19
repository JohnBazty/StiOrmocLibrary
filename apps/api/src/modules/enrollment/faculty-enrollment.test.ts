import ExcelJS from 'exceljs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnrollmentFile } from './enrollment-parser.ts'
import { currentRosterSql, enrollmentDecision } from './enrollment-policy.ts'
import { runMigrationInPglite } from '../../test-utils/pglite-migration.ts'

test('Faculty roster recognizes Faculty IDs and department without Student year requirements', async () => {
  const file = { originalname: 'synthetic.csv', buffer: Buffer.from('Faculty ID,Name,Department,School email\nFAC-001,Synthetic Faculty,Computing,faculty-fixture@ormoc.sti.edu.ph') }
  const parsed = await parseEnrollmentFile(file, { listedEnrolled: true, academicYear: '2026-2027', termName: '1st Semester', role: 'Faculty' })
  assert.equal(parsed.errors, 0)
  assert.equal(parsed.rows[0].data.program, 'Computing')
  assert.equal(parsed.rows[0].data.yearLevel, '')
  const student = await parseEnrollmentFile({ ...file, buffer: Buffer.from('Student ID,Name,Program,School email\nSTU-001,Synthetic Student,Computing,student-fixture@ormoc.sti.edu.ph') }, { listedEnrolled: true, academicYear: '2026-2027', termName: '1st Semester' })
  assert.ok(student.errors > 0)
})

test('Faculty enrollment migration scopes complete roster replacement by role and keeps private tables private', async () => {
  const pg = await runMigrationInPglite('061_faculty_enrollment.sql', `
    CREATE TABLE enrollment_roster_imports(roster_id int PRIMARY KEY,semester_id int,uploaded_by int,file_hash text,complete boolean,UNIQUE(semester_id,file_hash,complete));
    CREATE TABLE enrollment_roster_students(roster_id int,school_id text,school_email text);
    CREATE TABLE enrollment_signup_challenges(challenge_id uuid);
    INSERT INTO enrollment_roster_imports VALUES(1,1,1,'student-first',true);
    INSERT INTO enrollment_roster_students VALUES(1,'STU-001','student-fixture@ormoc.sti.edu.ph');
  `)
  try {
    await pg.queryAs('library_owner', "INSERT INTO enrollment_roster_imports VALUES(2,1,1,'faculty-first',true,'Faculty')")
    await pg.queryAs('library_owner', "INSERT INTO enrollment_roster_students VALUES(2,'FAC-001','faculty-fixture@ormoc.sti.edu.ph')")
    const studentSql = currentRosterSql.replace('?', '1')
    assert.equal((await pg.queryAs('library_owner', studentSql)).rows[0].school_id, 'STU-001')
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(pg.queryAs(role, 'SELECT * FROM enrollment_roster_imports'))
      await assert.rejects(pg.queryAs(role, 'SELECT * FROM enrollment_signup_challenges'))
    }
  } finally { await pg.close() }
})

test('Faculty borrowing follows its own semester roster and cannot inherit Student eligibility', async () => {
  const previous = process.env.ENROLLMENT_ROSTER_ENABLED
  process.env.ENROLLMENT_ROSTER_ENABLED = 'true'
  const queries: string[] = []
  const q = { execute: async (sql: string) => {
    queries.push(sql)
    if (sql.includes('enrollment_lifecycle')) return [[{ started: true }]]
    if (sql.includes('enrollment_semesters')) return [[{ semester_id: 1, academic_year: '2026-2027', term_name: '1st Semester' }]]
    return [[]]
  } }
  try {
    const result = await enrollmentDecision(q as never, 'FAC-001', 'Faculty')
    assert.equal(result.allowed, false)
    assert.ok(queries.some(sql => sql.includes("roster_role='Faculty'")))
  } finally { if (previous === undefined) delete process.env.ENROLLMENT_ROSTER_ENABLED; else process.env.ENROLLMENT_ROSTER_ENABLED = previous }
})


test('Faculty form export recognizes explicit institutional columns and ignores personal Username',async()=>{
 const csv='Timestamp,Username,Faculty ID/Number,"Full Name (First Name, Middle Initial, Last Name)",Department / Program,Institutional Email Address\n2026/11/12,personal@example.test,FAC-001,Synthetic Faculty,GE Department,FACULTY-FIXTURE@ORMOC.STI.EDU.PH'
 const result=await parseEnrollmentFile({originalname:'faculty-form.csv',buffer:Buffer.from(csv)},{listedEnrolled:true,academicYear:'2026-2027',termName:'1st Semester',role:'Faculty'})
 assert.equal(result.errors,0);assert.equal(result.rows[0].data.email,'faculty-fixture@ormoc.sti.edu.ph');assert.equal(result.rows[0].data.program,'GE Department');assert.equal(result.rows[0].data.name,'Synthetic Faculty')
})
test('Faculty placeholders and malformed institutional emails require correction instead of inventing identities',async()=>{
 const file={originalname:'faculty.csv',buffer:Buffer.from('Faculty ID,Name,Department,School email\nN/A,Synthetic One,GE,N/A\nNA,Synthetic Two,GE,sti.edu\nNONE,Synthetic Three,IT,wrong@ormoc.sti.edu\nFAC-004,Synthetic Four,GE,')}
 const result=await parseEnrollmentFile(file,{listedEnrolled:true,academicYear:'2026-2027',termName:'1st Semester',role:'Faculty'})
 assert.ok(result.rows.slice(0,3).every(row=>row.errors.some(error=>/ID/.test(error))))
 assert.ok(result.rows[1].errors.some(error=>/email/.test(error)));assert.ok(result.rows[2].errors.some(error=>/email/.test(error)))
 assert.equal(result.rows[3].errors.length,0);assert.ok(result.rows[3].warnings.length)
})

test('Faculty XLSX form ignores timestamp cells and rejects numeric IDs that could lose leading zeros',async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Faculty form')
 sheet.addRow(['Timestamp','Username','Faculty ID/Number','Full Name (First Name, Middle Initial, Last Name)','Department / Program','Institutional Email Address'])
 sheet.addRow([new Date('2026-11-12T01:00:00Z'),'personal@example.test','FAC-010','Synthetic Faculty','HTM','fixture-ten@ormoc.sti.edu.ph'])
 sheet.addRow([new Date('2026-11-12T01:01:00Z'),'personal-two@example.test',12345,'Synthetic Second','GE','fixture-two@ormoc.sti.edu.ph'])
 const parsed=await parseEnrollmentFile({originalname:'faculty.xlsx',buffer:Buffer.from(await workbook.xlsx.writeBuffer())},{role:'Faculty',listedEnrolled:true,academicYear:'2026-2027',termName:'1st Semester'})
 assert.equal(parsed.rows[0].errors.length,0);assert.ok(parsed.rows[1].errors.some(error=>/stored as a number/.test(error)));assert.equal(parsed.rows[0].data.schoolId,'FAC-010')
})
