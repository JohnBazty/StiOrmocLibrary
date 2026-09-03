import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

export type IsbnMetadata = {
  isbn: string
  title: string
  author: string
  publisher: string | null
  publicationYear: number | null
  source: 'local_catalog' | 'google_books' | 'open_library'
}

type LocalBookRow = RowDataPacket & {
  isbn: string
  title: string
  author: string | null
  publisher: string | null
  publication_year: number | null
}

export class IsbnLookupRepository {
  private readonly pool: Pool

  constructor(pool: Pool = db) { this.pool = pool }

  async findLocalByIsbn(isbn: string): Promise<IsbnMetadata | null> {
    const [rows] = await this.pool.execute<LocalBookRow[]>(
      `SELECT t.isbn,
              t.title,
              GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR '; ') AS author,
              t.publisher,
              t.publication_year
         FROM titles t
         LEFT JOIN authors a ON a.title_id = t.title_id
        WHERE t.isbn = ?
          AND t.record_type = 'Book'
        GROUP BY t.title_id, t.isbn, t.title, t.publisher, t.publication_year
        LIMIT 1`,
      [isbn],
    )
    const row = rows[0]
    if (!row) return null
    return {
      isbn: row.isbn,
      title: row.title,
      author: row.author ?? '',
      publisher: row.publisher,
      publicationYear: row.publication_year == null ? null : Number(row.publication_year),
      source: 'local_catalog',
    }
  }
}

export const isbnLookupRepository = new IsbnLookupRepository()
