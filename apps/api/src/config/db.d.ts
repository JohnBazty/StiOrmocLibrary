import type { Pool } from 'mysql2/promise'

/**
 * Dual-driver pool: mysql2 for local MySQL, or a mysql2-shaped pg adapter when
 * DATABASE_URL is set. Typed as mysql2 Pool so repositories keep a single contract.
 */
export declare const db: Pool
export declare const dbDriver: 'mysql' | 'postgres' | string
export declare function verifyDatabaseConnection(): Promise<void>
