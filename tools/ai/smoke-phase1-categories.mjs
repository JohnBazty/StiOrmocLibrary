/** Exercises Category mutations against Supabase while guaranteeing a final rollback. */
import dotenv from 'dotenv'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL) throw new Error('A Supabase DATABASE_URL is required')
const url = new URL(process.env.DATABASE_URL)
url.port = '6543'
process.env.DATABASE_URL = url.toString()

const { db } = await import('../../apps/api/src/config/db.js')
const { env } = await import('../../apps/api/src/config/env.js')
const { createCategoryService } = await import('../../apps/api/src/modules/catalog/categories/category.service.ts')
if (env.db.driver !== 'postgres') throw new Error('Refusing to test a non-Postgres database')

const connection = await db.getConnection()
let transactionStarted = false
try {
  await connection.beginTransaction()
  transactionStarted = true
  const [shelves] = await connection.execute(
    'SELECT label FROM floor_plan_shelves ORDER BY id LIMIT 1',
  )
  if (!shelves.length) throw new Error('No managed shelf is available for a Category smoke check')
  const shelfLocation = String(shelves[0].label)
  const safeConnection = {
    execute: (...args) => connection.execute(...args),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  }
  const service = createCategoryService({
    execute: (...args) => connection.execute(...args),
    getConnection: async () => safeConnection,
  })
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const first = await service.create({ categoryName: `Phase 1 smoke ${suffix} A`, shelfLocation })
  const fixtureTitle = `Phase 1 category fixture ${suffix}`
  const [titleInsert] = await connection.execute(
    "INSERT INTO titles(category_id,record_type,title,normalized_title,lifecycle_status) VALUES (?,'Book',?,?,'Active')",
    [first.categoryId, fixtureTitle, fixtureTitle.toLowerCase()],
  )
  const [materialInsert] = await connection.execute(
    "INSERT INTO materials(category_id,barcode,title,author,shelf_location,material_type,availability_status) VALUES (?,?,?,'Phase One Test',?,'Book','Available')",
    [first.categoryId, `PHASE1-CAT-${suffix}`, fixtureTitle, shelfLocation],
  )
  await connection.execute(
    "INSERT INTO physical_copies(title_id,material_id,barcode,accession_number,shelf_location,availability_status,lifecycle_status) VALUES (?,?,?,?,?,'Available','Active')",
    [titleInsert.insertId, materialInsert.insertId, `PHASE1-CAT-COPY-${suffix}`, `PHASE1-CAT-ACC-${suffix}`, shelfLocation],
  )
  await service.update(first.categoryId, { categoryName: `Phase 1 smoke ${suffix} updated`, shelfLocation })
  const second = await service.create({ categoryName: `Phase 1 smoke ${suffix} B`, shelfLocation })
  const reassigned = await service.reassign({ oldCategoryId: first.categoryId, targetCategoryId: second.categoryId })
  if (!reassigned.deletedOldCategory) throw new Error('Category reassignment did not complete')
  const [moved] = await connection.execute(
    `SELECT t.category_id AS title_category,m.category_id AS material_category,
            m.shelf_location AS material_shelf,pc.shelf_location AS copy_shelf
       FROM titles t JOIN materials m ON m.material_id=?
       JOIN physical_copies pc ON pc.material_id=m.material_id
      WHERE t.title_id=?`, [materialInsert.insertId, titleInsert.insertId],
  )
  if (Number(moved[0]?.title_category) !== second.categoryId || Number(moved[0]?.material_category) !== second.categoryId ||
      moved[0]?.material_shelf !== shelfLocation || moved[0]?.copy_shelf !== shelfLocation) {
    throw new Error('Assigned book and copy did not follow category reassignment')
  }
  await connection.execute('DELETE FROM physical_copies WHERE title_id=?', [titleInsert.insertId])
  await connection.execute('DELETE FROM materials WHERE material_id=?', [materialInsert.insertId])
  await connection.execute('DELETE FROM titles WHERE title_id=?', [titleInsert.insertId])
  const removed = await service.remove(second.categoryId)
  if (!removed.deleted) throw new Error('Category removal did not complete')
  process.stdout.write('Supabase Category create, edit, reassign, and delete passed inside one rollback-only transaction.\n')
} finally {
  if (transactionStarted) await connection.rollback()
  connection.release()
  await db.end()
}
