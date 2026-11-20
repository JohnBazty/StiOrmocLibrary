import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'

/** Faculty have no fines (revisions 2026-11-20): no overdue fines and no violation fines. */
export const isFineExemptRole = (role: unknown) => String(role ?? '') === 'Faculty'

export async function isFineExemptUser(executor: Pick<Pool | PoolConnection, 'execute'>, userId: unknown) {
  const [rows] = await executor.execute<RowDataPacket[]>('SELECT user_role FROM users WHERE user_id=? LIMIT 1', [userId])
  return isFineExemptRole(Array.isArray(rows) ? rows[0]?.user_role : undefined)
}
