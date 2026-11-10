/** One row of a SELECT result (column name to value). */
export interface RowDataPacket { [column: string]: any }

/** What a write statement (INSERT/UPDATE/DELETE) resolves to in `pg-pool.js`. */
export interface ResultSetHeader {
  insertId: number
  affectedRows: number
  rowCount: number
  rows: RowDataPacket[]
}

type QueryValues = readonly unknown[]
type Execute = <T = RowDataPacket[] | ResultSetHeader>(sql: string, values?: QueryValues) => Promise<[T, unknown]>

export interface PoolConnection {
  execute: Execute
  query: Execute
  ping(): Promise<void>
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  release(): void
}

export interface Pool {
  driver: 'postgres'
  execute: Execute
  query: Execute
  getConnection(): Promise<PoolConnection>
  end(): Promise<void>
}

/** Postgres pool with a `?`-placeholder `execute`, built in `pg-pool.js`. */
export declare const db: Pool
export declare function verifyDatabaseConnection(): Promise<void>
