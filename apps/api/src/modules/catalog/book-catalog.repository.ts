import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { BookCatalogFilters } from './book-catalog.validation.ts'

const STOCK_JOIN = `LEFT JOIN (
    SELECT
      pc.title_id,
      COUNT(*) AS total_copies_count,
      SUM(pc.availability_status = 'Available' AND pc.material_id IS NOT NULL) AS available_copies_count,
      SUM(pc.availability_status = 'Borrowed') AS borrowed_copies_count,
      SUM(pc.availability_status = 'Reserved') AS reserved_copies_count,
      MIN(CASE WHEN pc.availability_status = 'Available' AND pc.material_id IS NOT NULL THEN pc.shelf_location END) AS available_shelf_location,
      MIN(CASE WHEN pc.availability_status = 'Available' AND pc.material_id IS NOT NULL THEN pc.barcode END) AS preview_barcode,
      SUBSTRING_INDEX(
        GROUP_CONCAT(pc.condition_status ORDER BY (pc.availability_status = 'Available') DESC, pc.physical_copy_id ASC SEPARATOR ','),
        ',', 1
      ) AS current_condition_status,
      MIN(pc.shelf_location) AS any_shelf_location,
      MIN(CASE WHEN pc.material_id IS NOT NULL THEN pc.material_id END) AS reservable_material_id
    FROM physical_copies pc
    WHERE pc.lifecycle_status = 'Active'
    GROUP BY pc.title_id
  ) stock ON stock.title_id = t.title_id`

const AUTHOR_JOIN = `LEFT JOIN (
    SELECT
      a.title_id,
      GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ') AS author
    FROM authors a
    GROUP BY a.title_id
  ) credits ON credits.title_id = t.title_id`

const WAITLIST_JOIN = `LEFT JOIN (
    SELECT r.book_title_id, COUNT(*) AS active_waiting_count
      FROM reservations r
     WHERE r.reservation_status IN ('pending', 'approved', 'ready_for_pickup')
       AND r.book_title_id IS NOT NULL
     GROUP BY r.book_title_id
  ) waiting ON waiting.book_title_id = t.title_id`

const SELECT_FIELDS = `SELECT
    t.title_id,
    t.title,
    COALESCE(credits.author, 'Unknown author') AS author,
    t.isbn,
    t.publisher,
    t.publication_year,
    t.call_number,
    t.cover_image_path,
    t.category_id,
    COALESCE(c.category_name, 'Uncategorized') AS category_name,
    COALESCE(stock.available_shelf_location, stock.any_shelf_location, t.call_number) AS shelf_location,
    COALESCE(stock.total_copies_count, 0) AS total_copies_count,
    CASE WHEN COALESCE(waiting.active_waiting_count, 0) > 0
      THEN 0 ELSE COALESCE(stock.available_copies_count, 0) END AS available_copies_count,
    stock.reservable_material_id,
    stock.preview_barcode,
    stock.current_condition_status,
    CASE
      WHEN COALESCE(waiting.active_waiting_count, 0) > 0 THEN 'Reserved'
      WHEN COALESCE(stock.available_copies_count, 0) > 0 THEN 'Available'
      WHEN COALESCE(stock.reserved_copies_count, 0) > 0 THEN 'Reserved'
      WHEN COALESCE(stock.borrowed_copies_count, 0) > 0 THEN 'Borrowed'
      ELSE 'Unavailable'
    END AS current_availability_status`

function like(value: string) {
  return `%${value}%`
}

export function buildBookCatalogQuery(filters: BookCatalogFilters) {
  const where = [
    "t.record_type = 'Book'",
    "t.lifecycle_status = 'Active'",
    `EXISTS (
      SELECT 1
        FROM physical_copies visible_copy
       WHERE visible_copy.title_id = t.title_id
         AND visible_copy.lifecycle_status = 'Active'
         AND visible_copy.availability_status IN ('Available', 'Borrowed', 'Reserved')
         AND visible_copy.material_id IS NOT NULL
    )`,
  ]
  const parameters: Array<string | number> = []

  if (filters.categoryId !== null) {
    where.push('t.category_id = ?')
    parameters.push(filters.categoryId)
  }
  if (filters.categoryName) {
    where.push('LOWER(c.category_name) = LOWER(?)')
    parameters.push(filters.categoryName)
  }
  if (filters.publicationYear !== null) {
    where.push('t.publication_year = ?')
    parameters.push(filters.publicationYear)
  }
  if (filters.title) {
    where.push('t.title LIKE ?')
    parameters.push(like(filters.title))
  }
  if (filters.author) {
    where.push('EXISTS (SELECT 1 FROM authors author_filter WHERE author_filter.title_id = t.title_id AND author_filter.normalized_name LIKE ?)')
    parameters.push(like(filters.author.toLocaleLowerCase('en-US')))
  }
  if (filters.isbn) {
    where.push('t.isbn LIKE ?')
    parameters.push(like(filters.isbn))
  }
  if (filters.query) {
    const pattern = like(filters.query)
    where.push(`(
      t.title LIKE ? OR t.isbn LIKE ? OR c.category_name LIKE ? OR
      CAST(t.publication_year AS CHAR) = ? OR
      EXISTS (SELECT 1 FROM authors search_author WHERE search_author.title_id = t.title_id AND search_author.author_name LIKE ?)
    )`)
    parameters.push(pattern, pattern, pattern, filters.query, pattern)
  }

  const fromSql = `FROM titles t
    LEFT JOIN categories c ON c.category_id = t.category_id
    ${AUTHOR_JOIN}
    ${STOCK_JOIN}
    ${WAITLIST_JOIN}`
  const whereSql = `WHERE ${where.join('\n AND ')}`
  const offset = (filters.page - 1) * filters.limit

  return {
    dataSql: `${SELECT_FIELDS}\n${fromSql}\n${whereSql}\nORDER BY t.title ASC, t.title_id ASC\nLIMIT ${filters.limit} OFFSET ${offset}`,
    countSql: `SELECT COUNT(*) AS total FROM titles t LEFT JOIN categories c ON c.category_id = t.category_id ${whereSql}`,
    dataParameters: [...parameters],
    countParameters: [...parameters],
  }
}

function mapBook(row: RowDataPacket) {
  return {
    titleId: Number(row.title_id),
    title: String(row.title),
    author: String(row.author),
    isbn: row.isbn ? String(row.isbn) : null,
    publisher: row.publisher ? String(row.publisher) : null,
    publicationYear: row.publication_year === null ? null : Number(row.publication_year),
    categoryId: row.category_id === null ? null : Number(row.category_id),
    categoryName: String(row.category_name),
    callNumber: row.call_number ? String(row.call_number) : null,
    coverImagePath: row.cover_image_path ? String(row.cover_image_path) : null,
    shelfLocation: row.shelf_location ? String(row.shelf_location) : null,
    currentAvailabilityStatus: String(row.current_availability_status),
    currentConditionStatus: row.current_condition_status ? String(row.current_condition_status) : null,
    totalCopiesCount: Number(row.total_copies_count ?? 0),
    availableCopiesCount: Number(row.available_copies_count ?? 0),
    reservableMaterialId: row.reservable_material_id === null ? null : Number(row.reservable_material_id),
    previewBarcode: row.preview_barcode ? String(row.preview_barcode) : null,
  }
}

export async function queryBookCatalog(database: Pool, filters: BookCatalogFilters) {
  const query = buildBookCatalogQuery(filters)
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(query.dataSql, query.dataParameters),
    database.execute<RowDataPacket[]>(query.countSql, query.countParameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(mapBook),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  }
}

export async function queryBookCategories(database: Pool) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT c.category_id, c.category_name
       FROM categories c
      ORDER BY c.category_name ASC`,
  )
  return rows.map((row) => ({
    categoryId: Number(row.category_id),
    categoryName: String(row.category_name),
  }))
}

export async function queryBookOverview(database: Pool, titleId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `${SELECT_FIELDS}
     FROM titles t
     LEFT JOIN categories c ON c.category_id = t.category_id
     ${AUTHOR_JOIN}
     ${STOCK_JOIN}
     ${WAITLIST_JOIN}
     WHERE t.title_id = ? AND t.record_type = 'Book' AND t.lifecycle_status = 'Active'
       AND EXISTS (
         SELECT 1 FROM physical_copies visible_copy
          WHERE visible_copy.title_id = t.title_id
            AND visible_copy.lifecycle_status = 'Active'
            AND visible_copy.availability_status IN ('Available', 'Borrowed', 'Reserved')
            AND visible_copy.material_id IS NOT NULL
       )
     LIMIT 1`,
    [titleId],
  )
  return rows[0] ? mapBook(rows[0]) : null
}

export async function queryViewerActiveBookCount(database: Pool, accountId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT COALESCE(activity.title_id, -activity.material_id)) AS active_count
       FROM accounts account
       LEFT JOIN (
         SELECT bt.user_id, bt.material_id, borrowed_copy.title_id
           FROM borrow_transactions bt
           LEFT JOIN physical_copies borrowed_copy
             ON borrowed_copy.physical_copy_id = bt.physical_copy_id
             OR (bt.physical_copy_id IS NULL AND borrowed_copy.material_id = bt.material_id)
          WHERE bt.transaction_status IN ('Pending', 'Borrowed', 'Overdue')
         UNION ALL
         SELECT r.user_id, r.material_id, COALESCE(r.book_title_id, reserved_copy.title_id) AS title_id
           FROM reservations r
           LEFT JOIN physical_copies reserved_copy ON reserved_copy.material_id = r.material_id
          WHERE r.reservation_status IN ('pending', 'approved', 'ready_for_pickup')
       ) activity ON activity.user_id = account.user_id
       LEFT JOIN materials material ON material.material_id = activity.material_id
      WHERE account.account_id = ? AND material.material_type = 'Book'`,
    [accountId],
  )
  return Number(rows[0]?.active_count ?? 0)
}

export async function queryReservationTarget(database: Pool, accountId: number, titleId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT account.user_id, MIN(pc.material_id) AS material_id
       FROM accounts account
       JOIN titles t ON t.title_id = ? AND t.record_type = 'Book' AND t.lifecycle_status = 'Active'
       JOIN physical_copies pc ON pc.title_id = t.title_id
         AND pc.lifecycle_status = 'Active' AND pc.material_id IS NOT NULL
      WHERE account.account_id = ?
      GROUP BY account.user_id`,
    [titleId, accountId],
  )
  return rows[0] ? { userId: Number(rows[0].user_id), materialId: Number(rows[0].material_id) } : null
}
