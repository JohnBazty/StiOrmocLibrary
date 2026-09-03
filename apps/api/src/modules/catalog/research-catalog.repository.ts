import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { ResearchCatalogFilters } from './research-catalog.validation.ts'

const AUTHOR_JOIN = `JOIN (
    SELECT a.title_id,
      GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ') AS authors
    FROM authors a
    GROUP BY a.title_id
  ) credits ON credits.title_id = t.title_id`

const INVENTORY_JOIN = `LEFT JOIN (
    SELECT ri.title_id,
      MIN(ri.research_inventory_id) AS research_inventory_id,
      MIN(ri.shelf_location) AS shelf_location,
      SUM(ri.availability_status = 'available') AS available_copies,
      SUM(ri.availability_status = 'reserved') AS reserved_copies
    FROM research_inventory ri
    WHERE ri.lifecycle_status = 'Active'
    GROUP BY ri.title_id
  ) inventory ON inventory.title_id = t.title_id`

const SELECT = `SELECT
    t.title_id, t.title, t.publication_year,
    credits.authors,
    rr.research_record_id, rr.research_code, rr.adviser_name,
    rr.department_or_program, rr.abstract_text, rr.keywords_text,
    rr.viewing_status,
    inventory.research_inventory_id,
    COALESCE(inventory.shelf_location, c.shelf_location, 'Research Archive') AS shelf_location,
    CASE
      WHEN COALESCE(inventory.available_copies, 0) > 0 AND rr.viewing_status = 'Available for Viewing' THEN 'Available'
      WHEN COALESCE(inventory.reserved_copies, 0) > 0 THEN 'Reserved'
      ELSE 'Unavailable'
    END AS access_status`

function contains(value: string) { return `%${value}%` }

export function buildResearchCatalogQuery(filters: ResearchCatalogFilters) {
  const where = ["t.record_type = 'Research/Thesis'", "t.lifecycle_status = 'Active'", "rr.viewing_status <> 'Archived'"]
  const parameters: Array<string | number> = []
  if (filters.title) { where.push('t.title LIKE ?'); parameters.push(contains(filters.title)) }
  if (filters.authors) {
    where.push('EXISTS (SELECT 1 FROM authors author_filter WHERE author_filter.title_id = t.title_id AND author_filter.normalized_name LIKE ?)')
    parameters.push(contains(filters.authors.toLocaleLowerCase('en-US')))
  }
  if (filters.adviser) { where.push('rr.adviser_name LIKE ?'); parameters.push(contains(filters.adviser)) }
  if (filters.department) { where.push('rr.department_or_program LIKE ?'); parameters.push(contains(filters.department)) }
  if (filters.publicationYear !== null) { where.push('t.publication_year = ?'); parameters.push(filters.publicationYear) }
  if (filters.query) {
    const pattern = contains(filters.query)
    where.push(`(t.title LIKE ? OR credits.authors LIKE ? OR rr.adviser_name LIKE ? OR
      rr.department_or_program LIKE ? OR rr.research_code LIKE ? OR CAST(t.publication_year AS CHAR) = ?)`)
    parameters.push(pattern, pattern, pattern, pattern, pattern, filters.query)
  }

  const from = `FROM titles t
    JOIN research_records rr ON rr.title_id = t.title_id
    ${AUTHOR_JOIN}
    LEFT JOIN categories c ON c.category_id = t.category_id
    ${INVENTORY_JOIN}`
  const whereSql = `WHERE ${where.join('\n AND ')}`
  const offset = (filters.page - 1) * filters.limit
  return {
    dataSql: `${SELECT}\n${from}\n${whereSql}\nORDER BY t.publication_year DESC, t.title ASC, t.title_id ASC\nLIMIT ${filters.limit} OFFSET ${offset}`,
    countSql: `SELECT COUNT(*) AS total ${from} ${whereSql}`,
    dataParameters: [...parameters], countParameters: [...parameters],
  }
}

function mapResearch(row: RowDataPacket) {
  return {
    titleId: Number(row.title_id ?? row.research_inventory_id),
    researchRecordId: Number(row.research_record_id ?? row.research_inventory_id),
    researchInventoryId: row.research_inventory_id === null ? null : Number(row.research_inventory_id),
    researchCode: String(row.research_code ?? row.accession_number ?? ''),
    title: String(row.title),
    authors: String(row.authors),
    adviser: String(row.adviser_name),
    department: String(row.department_or_program ?? 'Department not recorded'),
    publicationYear: row.publication_year === null ? null : Number(row.publication_year),
    shelfLocation: String(row.shelf_location),
    abstract: String(row.abstract_text ?? 'No abstract has been recorded for this research entry.'),
    keywords: row.keywords_text ? String(row.keywords_text) : null,
    accessStatus: String(row.access_status) as 'Available' | 'Reserved' | 'Unavailable',
    viewOnly: true as const,
  }
}

export async function queryResearchCatalog(database: Pool, filters: ResearchCatalogFilters) {
  const query = buildResearchCatalogQuery(filters)
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(query.dataSql, query.dataParameters),
    database.execute<RowDataPacket[]>(query.countSql, query.countParameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(mapResearch),
    pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
  }
}

export async function queryResearchOverview(database: Pool, titleId: number) {
  try {
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT
         t.title_id, t.title, t.publication_year,
         credits.authors,
         rr.research_record_id, rr.research_code, rr.adviser_name,
         rr.department_or_program, rr.abstract_text, rr.keywords_text,
         ri.research_inventory_id, ri.accession_number, ri.shelf_location,
         CASE
           WHEN ri.availability_status = 'available' AND rr.viewing_status = 'Available for Viewing' THEN 'Available'
           WHEN ri.availability_status = 'reserved' THEN 'Reserved'
           ELSE 'Unavailable'
         END AS access_status
       FROM research_inventory ri
       JOIN titles t ON t.title_id = ri.title_id
       JOIN research_records rr ON rr.title_id = t.title_id
       JOIN (
         SELECT a.title_id,
           GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ') AS authors
         FROM authors a
         GROUP BY a.title_id
       ) credits ON credits.title_id = t.title_id
       WHERE ri.research_inventory_id = ?
         AND ri.lifecycle_status = 'Active'
         AND t.lifecycle_status = 'Active'
         AND rr.viewing_status <> 'Archived'
       LIMIT 1`,
      [titleId],
    )
    return rows[0] ? mapResearch(rows[0]) : null
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (!['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code ?? '')) throw error

    // Backward-safe read for databases that have the original independent
    // inventory ledger but have not yet applied the normalized title bridge.
    const [legacyRows] = await database.execute<RowDataPacket[]>(
      `SELECT
         ri.research_inventory_id,
         ri.research_inventory_id AS title_id,
         ri.research_inventory_id AS research_record_id,
         ri.accession_number,
         ri.title,
         ri.authors,
         ri.adviser AS adviser_name,
         NULL AS department_or_program,
         ri.publication_year,
         ri.shelf_location,
         NULL AS abstract_text,
         NULL AS keywords_text,
         CASE
           WHEN ri.availability_status = 'available' THEN 'Available'
           WHEN ri.availability_status = 'reserved' THEN 'Reserved'
           ELSE 'Unavailable'
         END AS access_status
       FROM research_inventory ri
       WHERE ri.research_inventory_id = ?
       LIMIT 1`,
      [titleId],
    )
    return legacyRows[0] ? mapResearch(legacyRows[0]) : null
  }
}
