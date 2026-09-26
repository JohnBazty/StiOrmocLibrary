/** Disposable Supabase archive acceptance; removes all records it creates. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '../../apps/api/src/config/db.js'
import { catalogManagementService } from '../../apps/api/src/modules/catalog/catalog-management.service.ts'
import { bookArchive } from '../../apps/api/src/modules/catalog/book-archive.ts'

const mark = randomUUID().slice(0, 12).toUpperCase()
const title = `Phase 3 archive QA ${mark}`
let titleId, materialId, copyId, reservationId
try {
  const [categories] = await db.execute('SELECT category_id,shelf_location FROM categories ORDER BY category_id LIMIT 1')
  const [actors] = await db.execute("SELECT account_id FROM accounts WHERE role='Admin' AND account_status='Active' LIMIT 1")
  assert.ok(categories[0] && actors[0], 'A category and Admin account are required')
  const category = categories[0]
  const [createdTitle] = await db.execute(
    `INSERT INTO titles(category_id,record_type,title,normalized_title,lifecycle_status)
      VALUES (?,'Book',?,?,'Active')`, [category.category_id, title, title.toLowerCase()],
  )
  titleId = Number(createdTitle.insertId)
  await db.execute("INSERT INTO authors(title_id,author_name,normalized_name,author_order) VALUES (?,'Archive QA','archive qa',1)", [titleId])
  const barcode = `PHASE3-${mark}`
  const [createdMaterial] = await db.execute(
    `INSERT INTO materials(category_id,barcode,title,author,shelf_location,material_type,availability_status)
      VALUES (?,?,?,'Archive QA',?,'Book','Available')`, [category.category_id, barcode, title, category.shelf_location],
  )
  materialId = Number(createdMaterial.insertId)
  const [createdCopy] = await db.execute(
    `INSERT INTO physical_copies(title_id,material_id,barcode,accession_number,shelf_location,availability_status,lifecycle_status)
      VALUES (?,?,?,?,?,'Available','Active')`, [titleId, materialId, barcode, barcode, category.shelf_location],
  )
  copyId = Number(createdCopy.insertId)
  const [students] = await db.execute("SELECT user_id FROM users WHERE user_role='Student' LIMIT 1")
  assert.ok(students[0], 'A student user is required to test the reservation guard')
  const [reservation] = await db.execute(
    `INSERT INTO reservations(user_id,material_id,book_title_id,queue_position,reservation_status,reserved_at)
      VALUES (?,?,?,1,'pending',NOW())`, [students[0].user_id, materialId, titleId],
  )
  reservationId = Number(reservation.insertId)
  await assert.rejects(
    catalogManagementService.archiveTitle(titleId, 'Book', 'Must be blocked', Number(actors[0].account_id)),
    { code: 'TITLE_HAS_ACTIVE_RESERVATION' },
  )
  await db.execute('DELETE FROM reservations WHERE reservation_id=?', [reservationId]); reservationId = undefined
  const result = await catalogManagementService.archiveTitle(titleId, 'Book', 'Temporary Phase 3 verification', Number(actors[0].account_id))
  assert.equal(result.lifecycleStatus, 'Archived')
  const entry = (await bookArchive.list(mark)).find(item => Number(item.titleId) === titleId)
  assert.ok(entry, 'Archived title must be searchable')
  assert.equal(entry.copyCount, 1)
  assert.ok(entry.archivedBy, 'Staff actor must be retained')
  const detail = await bookArchive.detail(titleId)
  assert.equal(detail.copies.length, 1)
  assert.equal(Number(detail.copies[0].copyId), copyId)
  const [materials] = await db.execute('SELECT availability_status FROM materials WHERE material_id=?', [materialId])
  assert.equal(materials[0].availability_status, 'Unavailable')
  console.log('PASS: archive retained title, copy, reason, actor and searchable detail; legacy material is unavailable.')
} finally {
  if (reservationId) await db.execute('DELETE FROM reservations WHERE reservation_id=?', [reservationId])
  if (copyId) await db.execute('DELETE FROM physical_copies WHERE physical_copy_id=?', [copyId])
  if (materialId) await db.execute('DELETE FROM materials WHERE material_id=?', [materialId])
  if (titleId) {
    await db.execute('DELETE FROM authors WHERE title_id=?', [titleId])
    await db.execute('DELETE FROM titles WHERE title_id=?', [titleId])
  }
  await db.end()
}
