import type { PoolConnection } from '../../config/db.js'
import { recordRequestEvent, requestEventStatus } from './book-request-events.ts'

type Status = 'pending' | 'approved' | 'ready_for_pickup' | 'claimed' | 'cancelled' | 'expired'
export async function notifyReservationStatus(connection: PoolConnection, reservationId: number, userId: number, title: string, status: Status, deadline?: Date | null, occurredAt?:Date) {
  return recordRequestEvent(connection, reservationId, requestEventStatus(status, status === 'approved'),occurredAt)
}
