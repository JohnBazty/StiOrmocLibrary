import { createHash } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { scheduleToday, validateLibrarySchedule } from './library-schedule.validation.ts'

type Query = Pick<PoolConnection, 'execute'>
export function createLibraryScheduleService(database: Pool = db, clock = () => new Date()) {
  async function current(q: Query = database) {
    const [weekly] = await q.execute<RowDataPacket[]>('SELECT day_of_week,is_open,opens_at,closes_at FROM library_operating_schedule ORDER BY day_of_week')
    const [closures] = await q.execute<RowDataPacket[]>("SELECT to_char(closed_date,'YYYY-MM-DD') AS date,reason FROM library_closed_days WHERE closed_date>=?::date ORDER BY closed_date", [scheduleToday(clock())])
    const data = {
      timezone: 'Asia/Manila',
      weekly: weekly.map(day => ({ dayOfWeek: Number(day.day_of_week), isOpen: Boolean(day.is_open), opensAt: day.opens_at ? String(day.opens_at).slice(0, 5) : null, closesAt: day.closes_at ? String(day.closes_at).slice(0, 5) : null })),
      upcomingClosures: closures.map(closure => ({ date: String(closure.date), reason: String(closure.reason) })),
    }
    return { ...data, revision: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
  }
  return {
    current,
    async save(accountId: number, body: unknown) {
      const input = validateLibrarySchedule(body, scheduleToday(clock()))
      const c = await database.getConnection()
      try {
        await c.beginTransaction()
        await c.execute('SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE')
        await c.execute('SELECT account_id FROM accounts WHERE account_id=? FOR UPDATE', [accountId])
        await requireLibraryActor(c, accountId, 'library.manage')
        const before = await current(c)
        if (before.revision !== input.revision) throw new HttpError(409, 'LIBRARY_SCHEDULE_CHANGED', 'The library schedule changed. Refresh and review the latest schedule before saving again.')
        const [policy] = await c.execute<RowDataPacket[]>('SELECT preclosing_minutes FROM attendance_operation_settings WHERE settings_id=1')
        const cutoff = Number(policy[0]?.preclosing_minutes ?? 5)
        for (const day of input.weekly) {
          if (day.isOpen) {
            const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
            if (minutes(day.closesAt!) - minutes(day.opensAt!) <= cutoff) throw new HttpError(422, 'LIBRARY_SCHEDULE_TOO_SHORT', `Open hours must exceed the ${cutoff}-minute attendance cutoff before closing.`)
          }
          await c.execute(`INSERT INTO library_operating_schedule(day_of_week,is_open,opens_at,closes_at,updated_by_user_id,updated_at) VALUES(?,?,?::time,?::time,(SELECT user_id FROM accounts WHERE account_id=?),NOW()) ON CONFLICT(day_of_week) DO UPDATE SET is_open=EXCLUDED.is_open,opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`, [day.dayOfWeek, day.isOpen ? 1 : 0, day.opensAt, day.closesAt, accountId])
        }
        for (const closure of before.upcomingClosures) {
          if (!input.upcomingClosures.some(day => day.date === closure.date)) await c.execute('DELETE FROM library_closed_days WHERE closed_date=?::date', [closure.date])
        }
        for (const closure of input.upcomingClosures) await c.execute('INSERT INTO library_closed_days(closed_date,reason,created_by_user_id) VALUES(?::date,?,(SELECT user_id FROM accounts WHERE account_id=?)) ON CONFLICT(closed_date) DO UPDATE SET reason=EXCLUDED.reason', [closure.date, closure.reason, accountId])
        const saved = await current(c)
        await c.commit()
        return saved
      } catch (error) { await c.rollback(); throw error } finally { c.release() }
    },
  }
}
export const libraryScheduleService = createLibraryScheduleService()
