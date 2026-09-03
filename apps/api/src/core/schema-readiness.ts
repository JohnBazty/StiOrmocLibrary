import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../config/db.js'

const REQUIRED_COLUMNS: Record<string, string[]> = {
  categories: ['category_id', 'category_name', 'shelf_location', 'created_at', 'updated_at'],
  titles: ['title_id', 'category_id', 'record_type', 'title', 'cover_image_path', 'purchase_price', 'lifecycle_status'],
  authors: ['author_id', 'title_id', 'author_name'],
  research_records: ['research_record_id', 'title_id', 'research_code', 'adviser_name'],
  physical_copies: ['physical_copy_id', 'title_id', 'barcode', 'qr_code_data', 'accession_number', 'availability_status'],
  barcode_sequences: ['sequence_year', 'last_value', 'updated_at'],
  inventory_audit_events: ['inventory_audit_event_id', 'physical_copy_id', 'barcode_snapshot', 'event_type', 'action_reason', 'created_at'],
  research_inventory: ['research_inventory_id', 'title_id', 'title', 'authors', 'adviser', 'publication_year', 'accession_number', 'barcode', 'qr_code_data', 'condition_state', 'availability_status', 'lifecycle_status', 'shelf_location', 'archived_at', 'archive_reason'],
  research_inventory_audit_events: ['research_inventory_audit_event_id', 'research_inventory_id', 'barcode_snapshot', 'event_type', 'action_reason', 'created_at'],
  reservations: ['reservation_id', 'user_id', 'material_id', 'book_title_id', 'accession_id', 'assigned_physical_copy_id', 'reservation_status', 'reserved_at', 'pickup_deadline'],
  borrow_transactions: ['transaction_id', 'user_id', 'material_id', 'physical_copy_id', 'reservation_id', 'request_group_id', 'borrowed_at', 'due_at', 'returned_at', 'reported_lost_at', 'lost_confirmed_at', 'transaction_status'],
  admin_notifications: ['admin_notification_id', 'event_type', 'reservation_id', 'borrow_transaction_id', 'book_title_id', 'created_at'],
  library_closed_days: ['closed_date', 'reason', 'created_at'],
  library_operating_schedule: ['day_of_week', 'is_open', 'opens_at', 'closes_at'],
  notifications: ['notification_id', 'user_id', 'trigger_type', 'source_type', 'source_id', 'dedupe_key', 'is_read', 'read_at'],
  announcements: ['announcement_id', 'title', 'message_body', 'priority', 'announcement_status', 'publish_at', 'created_by_user_id'],
  announcement_revisions: ['announcement_revision_id', 'announcement_id', 'revision_number', 'changed_by_user_id'],
  clearance_overrides: ['clearance_override_id', 'user_id', 'override_status', 'reason', 'applied_by_user_id', 'revoked_at'],
  lost_book_reports: ['lost_book_report_id', 'transaction_id', 'user_id', 'report_status', 'replacement_charge', 'payment_status'],
  fines: ['fine_id', 'user_id', 'fine_type', 'fine_amount', 'payment_status', 'maximum_cap_applied', 'finalized_at'],
  fine_policy_versions: ['fine_policy_id', 'hourly_rate', 'daily_rate', 'maximum_penalty', 'effective_from', 'is_active'],
  fine_infractions: ['fine_infraction_id', 'fine_id', 'category', 'incident_at', 'details', 'issued_by_user_id'],
  fine_payment_receipts: ['fine_payment_receipt_id', 'receipt_number', 'request_key', 'user_id', 'amount_received', 'payment_method', 'receipt_status'],
  fine_payment_allocations: ['fine_payment_allocation_id', 'fine_payment_receipt_id', 'fine_id', 'lost_book_report_id', 'amount_allocated', 'balance_before', 'balance_after'],
  fine_adjustments: ['fine_adjustment_id', 'fine_id', 'adjustment_type', 'amount_adjusted', 'reason', 'adjusted_by_user_id'],
  users: ['user_id', 'school_id', 'user_role', 'password_hash'],
  accounts: ['account_id', 'school_id', 'contact_number', 'password_hash', 'role', 'account_status'],
  student_profiles: ['student_profile_id', 'account_id', 'first_name', 'last_name', 'program_strand', 'year_grade_level'],
  academic_terms: ['academic_term_id', 'academic_year', 'term_name', 'starts_on', 'ends_on', 'is_active'],
  attendance_logs: ['log_id', 'user_id', 'attendance_date', 'time_in', 'time_out', 'reason_for_visit'],
  print_requests: ['request_id', 'user_id', 'printer_id', 'paper_size', 'page_count', 'total_sheets', 'payment_status', 'job_status', 'row_version'],
  printing_service_settings: ['settings_id', 'accepting_requests', 'unavailable_reason', 'updated_by_user_id', 'updated_at'],
  print_file_download_audit: ['download_audit_id', 'request_id', 'downloaded_by_user_id', 'downloaded_at'],
  printers: ['printer_id', 'printer_name', 'operational_status', 'status_reason'],
  ink_repository: ['ink_id', 'printer_id', 'available_bottles', 'low_stock_threshold_bottles', 'cost_per_bottle'],
  bond_paper_stocks: ['paper_stock_id', 'paper_size_dimension', 'remaining_reams', 'unopened_reams', 'low_stock_threshold_reams'],
  print_pricing_rules: ['pricing_rule_id', 'print_type', 'paper_size', 'price_per_page', 'is_active'],
  print_status_history: ['print_status_history_id', 'request_id', 'from_status', 'to_status', 'created_at'],
  print_cash_payments: ['print_cash_payment_id', 'request_id', 'amount_paid', 'received_at'],
  ink_stock_movements: ['ink_stock_movement_id', 'ink_id', 'movement_type', 'activity_code', 'quantity_bottles', 'unit_cost_per_bottle', 'balance_before', 'balance_after', 'created_at'],
  paper_stock_movements: ['paper_stock_movement_id', 'paper_stock_id', 'movement_type', 'activity_code', 'quantity_reams', 'unit_cost_per_ream', 'balance_before', 'balance_after', 'created_at'],
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
