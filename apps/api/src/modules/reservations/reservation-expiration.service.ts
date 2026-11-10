import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'
import { createBookRequestService } from './book-request.service.ts'

export async function expireReadyReservations(database: Pool = db, now: Date = new Date(), batchSize = 100) {
  return createBookRequestService(database,()=>now).expire(now,batchSize)
}
