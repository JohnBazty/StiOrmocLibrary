// Disposable browser-only QA identities and workbook. Never prints credentials.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import ExcelJS from 'exceljs'
import { db, dbDriver } from '../src/config/db.js'
assert.equal(dbDriver, 'postgres')
const stateFile = new URL('../../../output/phase3-browser-fixtures.json', import.meta.url)
const fingerprint = async table => {
  const keys = { accounts:'account_id', users:'user_id', titles:'title_id', physical_copies:'physical_copy_id', borrow_transactions:'transaction_id' }
  const [rows] = await db.execute(`SELECT * FROM ${table} ORDER BY ${keys[table]}`)
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
let state
try {
  if (process.argv.includes('--cleanup')) {
    state = JSON.parse(await readFile(stateFile, 'utf8'))
    assert.match(state.marker, /^P3B-[A-F0-9]{12}$/)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [batches] = await connection.execute('SELECT batch_id FROM catalog_import_batches WHERE filename=?', [`${state.marker}.xlsx`])
      for (const batch of batches) {
        await connection.execute('UPDATE catalog_import_rows SET reuse_row_id=NULL WHERE batch_id=?', [batch.batch_id])
        await connection.execute('DELETE FROM catalog_import_batches WHERE batch_id=?', [batch.batch_id])
      }
      for (const [table, suffix] of [['catalog_courses',' course'],['catalog_programs',' program'],['catalog_resource_types',' type'],['catalog_locations',' shelf']]) {
        await connection.execute(`DELETE FROM ${table} WHERE name=?`, [state.marker + suffix])
      }
      const [accounts] = await connection.execute('SELECT account_id,user_id FROM accounts WHERE school_id LIKE ?', [`${state.marker}-%`])
      for (const account of accounts) {
        await connection.execute("DELETE FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [account.user_id])
        await connection.execute('DELETE FROM clearance_statuses WHERE user_id=?', [account.user_id])
        await connection.execute('DELETE FROM student_profiles WHERE account_id=?', [account.account_id])
        await connection.execute('DELETE FROM accounts WHERE account_id=? AND school_id LIKE ?', [account.account_id, `${state.marker}-%`])
        await connection.execute('DELETE FROM users WHERE user_id=? AND school_id LIKE ?', [account.user_id, `${state.marker}-%`])
      }
      for (const table of ['accounts','users']) {
        const [remaining]=await connection.execute(`SELECT COUNT(*) total FROM ${table} WHERE school_id LIKE ?`,[`${state.marker}-%`])
        assert.equal(Number(remaining[0].total),0)
      }
      const [batchesLeft]=await connection.execute('SELECT COUNT(*) total FROM catalog_import_batches WHERE filename=?',[`${state.marker}.xlsx`])
      assert.equal(Number(batchesLeft[0].total),0)
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
    for (const [table, before] of Object.entries(state.before)) assert.equal(await fingerprint(table), before, `Existing ${table} changed`)
    await unlink(new URL(`../../../output/${state.marker}.xlsx`,import.meta.url)).catch(error=>{if(error.code!=='ENOENT')throw error})
    await unlink(stateFile)
    console.log('CLEANUP VERIFIED: browser fixtures removed; existing accounts/users/titles/copies/loans fingerprints preserved.')
  } else {
    await assert.rejects(readFile(stateFile), { code:'ENOENT' }, 'Clean up existing browser fixtures first.')
    state = { marker:`P3B-${randomBytes(6).toString('hex').toUpperCase()}`, password:randomBytes(18).toString('hex'), fixtures:[], before:{} }
    for (const table of ['accounts','users','titles','physical_copies','borrow_transactions']) state.before[table] = await fingerprint(table)
    await mkdir(new URL('../../../output/', import.meta.url), { recursive:true })
    await writeFile(stateFile, JSON.stringify(state), { mode:0o600 })
    const hash = await bcrypt.hash(state.password,12), connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      for (const role of ['Librarian','Staff','Student','Faculty']) {
        const schoolId=`${state.marker}-${role.toUpperCase()}`, email=`${schoolId.toLowerCase()}@ormoc.sti.edu.ph`
        const [roles]=await connection.execute('SELECT role_id FROM roles WHERE role_name=?',[role==='Staff'?'Library Staff':role])
        assert.equal(roles.length,1)
        const [user]=await connection.execute("INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,account_status) VALUES (?,?,?,?,?,?,?,'Active')",[roles[0].role_id,role,schoolId,schoolId,`QA Catalog ${role}`,email,hash])
        const [account]=await connection.execute("INSERT INTO accounts(user_id,school_id,password_hash,role,account_status) VALUES (?,?,?,?,'Active')",[user.insertId,schoolId,hash,role])
        if(role==='Student') await connection.execute('INSERT INTO student_profiles(account_id,first_name,last_name,program_strand,year_grade_level) VALUES (?,?,?,?,?)',[account.insertId,'QA','Catalog Student','BSIT','4th Year'])
        state.fixtures.push({role,schoolId,email,accountId:Number(account.insertId),userId:Number(user.insertId)})
      }
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
    const workbook=new ExcelJS.Workbook(),first=workbook.addWorksheet('GE QA'),second=workbook.addWorksheet('IT QA')
    first.addRows([['Title','Author','Copies','Copyright year','Publication year'],[state.marker+' overlap','QA Author',2,2020,2021],[state.marker+' invalid','QA Author','bad',3026,2021]])
    second.addRows([['Book Title','Author/s','Copies','Year Published'],[state.marker+' overlap','QA Author',2,2021]])
    state.workbookPath=fileURLToPath(new URL(`../../../output/${state.marker}.xlsx`,import.meta.url))
    await workbook.xlsx.writeFile(new URL(`../../../output/${state.marker}.xlsx`,import.meta.url))
    await writeFile(stateFile,JSON.stringify(state),{mode:0o600})
    console.log('Disposable browser identities/workbook prepared; credentials remain only in ignored output.')
  }
} finally { await db.end() }
