import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'

type Query = Pick<PoolConnection, 'execute'>
export type ReservationSettings = { pickupWindowDays: number; waitingExpiryDays: number | null; waitingExpirySavedAt: Date | null }
export type ReservationSettingsView = {
  pickupWindowDays: number; pickupWindowChangedBy: string | null; pickupWindowChangedAt: string | null
  waitingExpiryDays: number | null; waitingExpiryChangedBy: string | null; waitingExpiryChangedAt: string | null
}
export type ReservationSettingsUpdate = { pickupWindowDays?: number }

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = Object.freeze({ pickupWindowDays: 1, waitingExpiryDays: null, waitingExpirySavedAt: null })
const DEFAULT_VIEW: ReservationSettingsView = Object.freeze({ pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null, waitingExpiryDays: null, waitingExpiryChangedBy: null, waitingExpiryChangedAt: null })
const PICKUP_MESSAGE = 'Enter a whole number of days from 1 to 7.'

export const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

// to_regclass never raises, so a missing table (043 not applied) cannot abort the caller's transaction.
async function tablePresent(q: Query) {
  const [rows] = await q.execute<RowDataPacket[]>("SELECT to_regclass('public.reservation_settings') IS NOT NULL AS present")
  return Boolean(rows[0]?.present)
}

export async function readReservationSettings(q: Query): Promise<ReservationSettings> {
  if (!await tablePresent(q)) return DEFAULT_RESERVATION_SETTINGS
  const [rows] = await q.execute<RowDataPacket[]>('SELECT pickup_window_days, waiting_expiry_days, waiting_expiry_saved_at FROM reservation_settings WHERE settings_id = 1')
  const row = rows[0]
  if (!row) return DEFAULT_RESERVATION_SETTINGS
  return {
    pickupWindowDays: Number(row.pickup_window_days),
    waitingExpiryDays: row.waiting_expiry_days == null ? null : Number(row.waiting_expiry_days),
    waitingExpirySavedAt: row.waiting_expiry_saved_at == null ? null : new Date(row.waiting_expiry_saved_at),
  }
}

const invalid = (field: string, message: string) => new HttpError(422, 'RESERVATION_SETTINGS_INVALID', message, { errors: { [field]: message } })
function wholeDays(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export function parseReservationSettingsUpdate(body: unknown): ReservationSettingsUpdate {
  const input = (body ?? {}) as Record<string, unknown>
  const pickupWindowDays = wholeDays(input.pickupWindowDays, 1, 7)
  if (pickupWindowDays == null) throw invalid('pickupWindowDays', PICKUP_MESSAGE)
  return { pickupWindowDays }
}

const iso = (value: unknown) => value == null ? null : new Date(value as string).toISOString()

export function createReservationSettingsService(database: Pool = db, clock = () => new Date()) {
  async function read(): Promise<ReservationSettingsView> {
    if (!await tablePresent(database)) return DEFAULT_VIEW
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT s.pickup_window_days, s.pickup_window_changed_at, s.waiting_expiry_days, s.waiting_expiry_saved_at,
      COALESCE(pu.full_name, pa.school_id) AS pickup_by, COALESCE(wu.full_name, wa.school_id) AS waiting_by
      FROM reservation_settings s
      LEFT JOIN accounts pa ON pa.account_id = s.pickup_window_changed_by LEFT JOIN users pu ON pu.user_id = pa.user_id
      LEFT JOIN accounts wa ON wa.account_id = s.waiting_expiry_changed_by LEFT JOIN users wu ON wu.user_id = wa.user_id
      WHERE s.settings_id = 1`)
    const row = rows[0]
    if (!row) return DEFAULT_VIEW
    return {
      pickupWindowDays: Number(row.pickup_window_days),
      pickupWindowChangedBy: row.pickup_by ?? null,
      pickupWindowChangedAt: iso(row.pickup_window_changed_at),
      waitingExpiryDays: row.waiting_expiry_days == null ? null : Number(row.waiting_expiry_days),
      waitingExpiryChangedBy: row.waiting_by ?? null,
      waitingExpiryChangedAt: iso(row.waiting_expiry_saved_at),
    }
  }

  async function save(actorAccountId: number, body: unknown) {
    const update = parseReservationSettingsUpdate(body)
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      await requireLibraryActor(q, actorAccountId, 'library.manage')
      const now = clock()
      if (update.pickupWindowDays !== undefined) {
        await q.execute(`INSERT INTO reservation_settings (settings_id, pickup_window_days, pickup_window_changed_by, pickup_window_changed_at) VALUES (1, ?, ?, ?)
          ON CONFLICT (settings_id) DO UPDATE SET pickup_window_days = EXCLUDED.pickup_window_days,
          pickup_window_changed_by = EXCLUDED.pickup_window_changed_by, pickup_window_changed_at = EXCLUDED.pickup_window_changed_at`,
        [update.pickupWindowDays, actorAccountId, now])
      }
      await q.commit()
    } catch (error) { await q.rollback(); throw error } finally { q.release() }
    return read()
  }

  return { read, save }
}

export const reservationSettingsService = createReservationSettingsService()
