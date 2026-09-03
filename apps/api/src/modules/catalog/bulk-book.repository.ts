import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { BulkBookInput } from './bulk-book.validation.ts'

export async function lockBookTitleByIsbn(connection: PoolConnection, isbn: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT t.title_id, t.title, t.category_id,
            (SELECT a.author_name FROM authors a
              WHERE a.title_id = t.title_id
              ORDER BY a.author_order, a.author_id LIMIT 1) AS author_name
       FROM titles t
      WHERE t.isbn = ? AND t.record_type = 'Book'
      LIMIT 1 FOR UPDATE`, [isbn],
  )
  if (!rows[0]?.title_id) return null
  return {
    titleId: Number(rows[0].title_id),
    title: String(rows[0].title),
    author: String(rows[0].author_name ?? ''),
    categoryId: Number(rows[0].category_id),
  }
}

export async function ensureBookLocationExists(connection: PoolConnection, shelfLocation: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT category_id FROM categories WHERE shelf_location = ? LIMIT 1', [shelfLocation],
  )
  return rows.length > 0
}

export async function createBulkBookTitle(connection: PoolConnection, input: BulkBookInput, coverImagePath: string | null) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO titles
       (category_id, record_type, title, normalized_title, isbn, publication_year, publisher, purchase_price,
        call_number, cover_image_path, search_text, lifecycle_status, created_at)
     VALUES (?, 'Book', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', NOW())`,
    [input.categoryId, input.title, input.title.toLocaleLowerCase('en-US'), input.isbn, input.publicationYear,
      input.publisher, input.purchasePrice, input.callNumber, coverImagePath, `${input.title} ${input.author} ${input.isbn}`.toLocaleLowerCase('en-US')],
  )
  await connection.execute(
    `INSERT INTO authors (title_id, author_name, normalized_name, author_order, created_at)
     VALUES (?, ?, ?, 1, NOW())`,
    [result.insertId, input.author, input.author.toLocaleLowerCase('en-US')],
  )
  return Number(result.insertId)
}

export async function updateBookCover(connection: PoolConnection, titleId: number, coverImagePath: string) {
  await connection.execute('UPDATE titles SET cover_image_path = ?, updated_at = NOW() WHERE title_id = ?', [coverImagePath, titleId])
}

export async function updateBookPurchasePrice(connection: PoolConnection, titleId: number, purchasePrice: number) {
  await connection.execute('UPDATE titles SET purchase_price = ?, updated_at = NOW() WHERE title_id = ?', [purchasePrice, titleId])
}

export async function reserveBarcodeSequence(connection: PoolConnection, year: number, count: number) {
  await connection.execute(
    'INSERT INTO barcode_sequences (`sequence_year`, `last_value`) VALUES (?, 0) ON DUPLICATE KEY UPDATE `last_value` = `last_value`', [year],
  )
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT `last_value` FROM barcode_sequences WHERE `sequence_year` = ? FOR UPDATE', [year],
  )
  const lastValue = Number(rows[0]?.last_value ?? 0)
  if (lastValue + count > 999999) throw new Error(`The ${year} barcode sequence is exhausted.`)
  await connection.execute('UPDATE barcode_sequences SET `last_value` = ?, `updated_at` = NOW() WHERE `sequence_year` = ?', [lastValue + count, year])
  return lastValue + 1
}

export async function insertGeneratedBookCopy(connection: PoolConnection, input: BulkBookInput, titleId: number, copy: {
  barcode: string; accessionNumber: string; qrCodeData: string
}) {
  const [material] = await connection.execute<ResultSetHeader>(
    `INSERT INTO materials
       (category_id, barcode, title, author, isbn, publication_year, shelf_location,
        material_type, availability_status, date_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Book', 'Available', NOW())`,
    [input.categoryId, copy.barcode, input.title, input.author, input.isbn, input.publicationYear, input.shelfLocation],
  )
  const [physicalCopy] = await connection.execute<ResultSetHeader>(
    `INSERT INTO physical_copies
       (title_id, material_id, barcode, qr_code_data, accession_number, shelf_location,
        condition_status, availability_status, lifecycle_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Good', 'Available', 'Active', NOW())`,
    [titleId, material.insertId, copy.barcode, copy.qrCodeData, copy.accessionNumber, input.shelfLocation],
  )
  return { materialId: Number(material.insertId), physicalCopyId: Number(physicalCopy.insertId) }
}
