export function libraryOperationRows(sql: string) {
  if (sql.includes('FROM library_operating_schedule')) {
    return [1, 2, 3, 4, 5, 6, 7].map(day_of_week => ({ day_of_week, is_open: true, opens_at: '00:00:00', closes_at: '23:59:59' }))
  }
  if (sql.includes('FROM attendance_logs WHERE user_id=')) return [{ log_id: 1, seat_visit: true, reason_for_visit: 'Study' }]
  if (sql.includes('FROM attendance_operation_settings')) return [{ configured: true, preclosing_minutes: 1 }]
  if (sql.startsWith('UPDATE attendance_logs')) return []
  if (/FROM library_(closed_days|operational_events|profile_settings)|FROM attendance_operation_settings|FROM attendance_logs/.test(sql)) return []
  return undefined
}

export function borrowerEligibilityRows(sql: string, role: string, userId: number) {
  if (sql.includes('FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id')) {
    return [{ user_id: userId, school_id: 'STI-7', user_role: role, account_id: userId, account_status: 'Active', login_status: 'Active' }]
  }
  if (/SELECT transaction_id(?:,physical_copy_id)? FROM borrow_transactions WHERE user_id=|SELECT transaction_id,physical_copy_id,reservation_id,transaction_status FROM borrow_transactions WHERE user_id=|FROM fines f LEFT JOIN|FROM lost_book_reports l LEFT JOIN|FROM clearance_overrides WHERE/.test(sql)) return []
  return libraryOperationRows(sql)
}
