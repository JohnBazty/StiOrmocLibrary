import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { escalateOverdueTransactions } from './circulation-overdue.service.ts'

export function startCirculationOverdueWorker(database: Pool = db, intervalMs = 60_000) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try { await escalateOverdueTransactions(database) }
    catch (error) { console.error('[Circulation] Overdue escalation failed.', error) }
    finally { running = false }
  }
  void run()
  const timer = setInterval(() => void run(), intervalMs)
  timer.unref()
  return timer
}
