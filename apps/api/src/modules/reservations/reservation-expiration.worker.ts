import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { expireReadyReservations } from './reservation-expiration.service.ts'

export async function startReservationExpirationWorker(database: Pool = db, intervalMs = 60_000) {
  const [columns] = await database.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS available_columns FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations'
        AND COLUMN_NAME IN ('accession_id', 'pickup_deadline')`,
  )
  if (Number(columns[0]?.available_columns ?? 0) < 2) {
    console.warn('[Reservation worker] Migration 20260816_004 is not applied; expiration scanning is disabled.')
    return { run: async () => undefined, stop: () => undefined }
  }
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try { await expireReadyReservations(database) }
    catch (error) { console.error('[Reservation worker] Expiration scan failed.', error) }
    finally { running = false }
  }
  const timer = setInterval(() => void run(), Math.max(intervalMs, 10_000))
  timer.unref()
  return { run, stop: () => clearInterval(timer) }
}
