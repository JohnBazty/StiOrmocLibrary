/** Move legacy print documents to private Supabase Storage without deleting local originals. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../apps/api/src/config/env.js'

if (env.db.driver !== 'postgres' || !env.supabase.url || !env.supabase.secretKey) {
  throw new Error('Supabase database and server storage credentials are required.')
}

const apply = process.argv.includes('--apply')
const dbUrl = new URL(env.db.connectionString)
if (dbUrl.hostname.endsWith('.pooler.supabase.com') && dbUrl.port === '5432') dbUrl.port = '6543'
const db = new pg.Client({ connectionString: dbUrl.toString() })
const storage = createClient(env.supabase.url, env.supabase.secretKey).storage.from('printing-documents')
const prefix = 'supabase://printing-documents/'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

await db.connect()
try {
  const { rows } = await db.query("SELECT request_id,file_path FROM print_requests WHERE file_path NOT LIKE 'supabase://%' ORDER BY request_id")
  console.log(`${rows.length} legacy print document(s) found. ${apply ? 'Migrating.' : 'Dry run; pass --apply to migrate.'}`)
  for (const row of rows) {
    const originalPath = String(row.file_path)
    const name = path.win32.basename(originalPath)
    const extension = path.extname(name).toLowerCase()
    if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(name) || !['.pdf', '.docx'].includes(extension)) {
      throw new Error(`Request ${row.request_id} has an unexpected local document path.`)
    }
    const bytes = await readFile(originalPath)
    if (bytes.length > 4 * 1024 * 1024) throw new Error(`Request ${row.request_id} exceeds the hosted download limit.`)
    if (extension === '.pdf' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`Request ${row.request_id} does not contain a PDF.`)
    }
    if (!apply) {
      console.log(`Request ${row.request_id}: local document available (${bytes.length} bytes).`)
      continue
    }
    const contentType = extension === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const uploaded = await storage.upload(name, bytes, { contentType, upsert: false })
    if (uploaded.error) throw new Error(`Request ${row.request_id} upload failed: ${uploaded.error.message}`)
    try {
      const download = await storage.download(name)
      if (download.error || !download.data) throw new Error(download.error?.message ?? 'Download failed')
      if (digest(Buffer.from(await download.data.arrayBuffer())) !== digest(bytes)) throw new Error('Uploaded bytes differ from the local file')
      const updated = await db.query('UPDATE print_requests SET file_path=$1 WHERE request_id=$2 AND file_path=$3', [prefix + name, row.request_id, originalPath])
      if (updated.rowCount !== 1) throw new Error('The print request changed during migration')
      console.log(`Request ${row.request_id}: migrated and verified (${bytes.length} bytes).`)
    } catch (error) {
      await storage.remove([name])
      throw error
    }
  }
} finally {
  await db.end()
}
