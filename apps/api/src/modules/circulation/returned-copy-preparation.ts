import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { allocateWaitingRequests } from '../reservations/book-request.service.ts'

/** A returned usable copy enters preparation, never automatic readiness. */
export async function prepareReturnedCopy(q:PoolConnection,c:RowDataPacket,now=new Date()) {
  const usable=!['Damaged','Lost','For Repair'].includes(String(c.condition_status)) && c.lifecycle_status!=='Archived'
  const availability=usable?'Available':'Unavailable'
  await q.execute('UPDATE physical_copies SET availability_status=?,row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?',[availability,c.physical_copy_id])
  await q.execute('UPDATE materials SET availability_status=?,updated_at=NOW() WHERE material_id=?',[availability,c.material_id])
  if(usable) await allocateWaitingRequests(q,Number(c.title_id),now)
  const [rows]=await q.execute<RowDataPacket[]>('SELECT availability_status FROM physical_copies WHERE physical_copy_id=?',[c.physical_copy_id])
  const [requests]=await q.execute<RowDataPacket[]>(`SELECT reservation_id FROM reservations WHERE assigned_physical_copy_id=?
    AND reservation_status IN ('approved','ready_for_pickup') ORDER BY reservation_id LIMIT 1`,[c.physical_copy_id])
  return {nextReservationId:requests[0]?Number(requests[0].reservation_id):null,copyAvailability:rows[0]?.availability_status??availability}
}
