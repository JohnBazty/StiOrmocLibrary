import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../config/db.js'

const REQUIRED_COLUMNS: Record<string, string[]> = {
  categories: ['category_id', 'category_name', 'shelf_location', 'created_at', 'updated_at'],
  titles: ['title_id', 'category_id', 'record_type', 'title', 'lifecycle_status'],
  authors: ['author_id', 'title_id', 'author_name'],
  research_records: ['research_record_id', 'title_id', 'research_code', 'adviser_name'],
  physical_copies: ['physical_copy_id', 'title_id', 'barcode', 'accession_number', 'availability_status'],
  inventory_audit_events: ['inventory_audit_event_id', 'physical_copy_id', 'barcode_snapshot', 'event_type', 'created_at'],
  reservations: ['reservation_id', 'user_id', 'material_id', 'accession_id', 'reservation_status', 'reserved_at', 'pickup_deadline'],
  users: ['user_id', 'school_id', 'user_role', 'password_hash'],
  accounts: ['account_id', 'school_id', 'contact_number', 'password_hash', 'role', 'account_status'],
  student_profiles: ['student_profile_id', 'account_id', 'first_name', 'last_name', 'program_strand', 'year_grade_level'],
}

export type SchemaReadiness = { ready: boolean; missingTables: string[]; missingColumns: string[] }

export async function checkSchemaReadiness(database: Pool = db): Promise<SchemaReadiness> {
  const tableNames = Object.keys(REQUIRED_COLUMNS)
  const placeholders = tableNames.map(() => '?').join(', ')
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    tableNames,
  )
  const found = new Map<string, Set<string>>()
  for (const row of rows) {
    const table = String(row.TABLE_NAME ?? row.table_name)
    const column = String(row.COLUMN_NAME ?? row.column_name)
    if (!found.has(table)) found.set(table, new Set())
    found.get(table)!.add(column)
  }
  const missingTables = tableNames.filter((table) => !found.has(table))
  const missingColumns = tableNames.flatMap((table) =>
    missingTables.includes(table) ? [] : REQUIRED_COLUMNS[table]
      .filter((column) => !found.get(table)?.has(column))
      .map((column) => `${table}.${column}`),
  )
  return { ready: missingTables.length === 0 && missingColumns.length === 0, missingTables, missingColumns }
}

export function isMissingSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_CANT_DROP_FIELD_OR_KEY', 'ER_KEY_COLUMN_DOES_NOT_EXITS'].includes(code ?? '')
}
