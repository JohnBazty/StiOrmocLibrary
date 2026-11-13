import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { authorsAgg } from '../../config/sql-dialect.js'

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
              ${authorsAgg('a', '; ')} AS author,
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

  /** Which of these ISBNs an active book title already carries. */
  async findLocalIsbns(isbns: string[]): Promise<Set<string>> {
    if (!isbns.length) return new Set()
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT isbn FROM titles WHERE record_type = 'Book' AND isbn = ANY(?::text[])`, [isbns])
    return new Set(rows.map((row) => String(row.isbn)))
  }

  /** Up to 10 active book titles whose title and one author contain these texts (an empty text matches any), so staff see the book may already exist. */
  async findLocalByTitle(title: string, author: string): Promise<Array<{ titleId: number; title: string; author: string; isbn: string | null }>> {
    const pattern = (value: string) => `%${value.toLocaleLowerCase('en-US').replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.title_id, t.title, t.isbn, (SELECT ${authorsAgg('a', '; ')} FROM authors a WHERE a.title_id = t.title_id) AS author
         FROM titles t
        WHERE t.record_type = 'Book' AND t.lifecycle_status = 'Active' AND t.normalized_title ILIKE ?
          AND (? = '' OR EXISTS (SELECT 1 FROM authors w WHERE w.title_id = t.title_id AND w.author_name ILIKE ?))
        ORDER BY t.title_id DESC LIMIT 10`,
      [pattern(title), author, pattern(author)],
    )
    return rows.map((row) => ({ titleId: Number(row.title_id), title: String(row.title), author: String(row.author ?? ''), isbn: row.isbn === null ? null : String(row.isbn) }))
  }
}

export const isbnLookupRepository = new IsbnLookupRepository()
