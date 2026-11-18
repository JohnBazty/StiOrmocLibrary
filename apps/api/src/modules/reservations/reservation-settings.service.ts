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
export type ReservationSettingsUpdate = { pickupWindowDays?: number; waitingExpiryDays?: number | null }

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = Object.freeze({ pickupWindowDays: 1, waitingExpiryDays: null, waitingExpirySavedAt: null })
const DEFAULT_VIEW: ReservationSettingsView = Object.freeze({ pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null, waitingExpiryDays: null, waitingExpiryChangedBy: null, waitingExpiryChangedAt: null })
const PICKUP_MESSAGE = 'Enter a whole number of days from 1 to 7.'
const WAITING_MESSAGE = 'Leave blank to turn off, or enter a whole number of days from 7 to 90.'

export const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

const DAY_MS = 86_400_000

/** A waiting request expires at max(reserved_at, saved_at) + L x 24 h; null while the limit is off. */
export function waitingExpiresAt(reservedAt: Date, settings: ReservationSettings): Date | null {
  if (settings.waitingExpiryDays == null) return null
  const savedAt = settings.waitingExpirySavedAt
  const start = savedAt && savedAt.getTime() > reservedAt.getTime() ? savedAt : reservedAt
  return new Date(start.getTime() + settings.waitingExpiryDays * DAY_MS)
}

/** Requests reserved at or before the cutoff have expired by now; null when none can have (limit off, or less than L days since the save). */
export function waitingExpiryCutoff(now: Date, settings: ReservationSettings): Date | null {
  if (settings.waitingExpiryDays == null) return null
  const span = settings.waitingExpiryDays * DAY_MS
  if (settings.waitingExpirySavedAt && now.getTime() < settings.waitingExpirySavedAt.getTime() + span) return null
  return new Date(now.getTime() - span)
}

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

/** A key present in the body means that setting is saved; every key is validated before any write. */
export function parseReservationSettingsUpdate(body: unknown): ReservationSettingsUpdate {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const hasPickup = Object.hasOwn(input, 'pickupWindowDays')
  const hasWaiting = Object.hasOwn(input, 'waitingExpiryDays')
  if (!hasPickup && !hasWaiting) throw new HttpError(422, 'RESERVATION_SETTINGS_INVALID', 'Choose a setting to save.')
  const update: ReservationSettingsUpdate = {}
  if (hasPickup) {
    const days = wholeDays(input.pickupWindowDays, 1, 7)
    if (days == null) throw invalid('pickupWindowDays', PICKUP_MESSAGE)
    update.pickupWindowDays = days
  }
  if (hasWaiting) {
    const value = input.waitingExpiryDays
    const off = value === null || (typeof value === 'string' && value.trim() === '')
    const days = off ? null : wholeDays(value, 7, 90)
    if (!off && days == null) throw invalid('waitingExpiryDays', WAITING_MESSAGE)
    update.waitingExpiryDays = days
  }
  return update
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
      if (!await tablePresent(q)) throw new HttpError(503, 'RESERVATION_SETTINGS_UNAVAILABLE', 'Reservation settings need the latest database update. Ask the system administrator to apply it.')
      const now = clock()
      if (update.pickupWindowDays !== undefined) {
        await q.execute(`INSERT INTO reservation_settings (settings_id, pickup_window_days, pickup_window_changed_by, pickup_window_changed_at) VALUES (1, ?, ?, ?)
          ON CONFLICT (settings_id) DO UPDATE SET pickup_window_days = EXCLUDED.pickup_window_days,
          pickup_window_changed_by = EXCLUDED.pickup_window_changed_by, pickup_window_changed_at = EXCLUDED.pickup_window_changed_at`,
        [update.pickupWindowDays, actorAccountId, now])
      }
      // Saved time moves on every save, same value too: the waiting-list count restarts (SPEC interview round 2).
      if (update.waitingExpiryDays !== undefined) {
        await q.execute(`INSERT INTO reservation_settings (settings_id, waiting_expiry_days, waiting_expiry_changed_by, waiting_expiry_saved_at) VALUES (1, ?, ?, ?)
          ON CONFLICT (settings_id) DO UPDATE SET waiting_expiry_days = EXCLUDED.waiting_expiry_days,
          waiting_expiry_changed_by = EXCLUDED.waiting_expiry_changed_by, waiting_expiry_saved_at = EXCLUDED.waiting_expiry_saved_at`,
        [update.waitingExpiryDays, actorAccountId, now])
      }
      await q.commit()
    } catch (error) { await q.rollback(); throw error } finally { q.release() }
    return read()
  }

  return { read, save }
}

export const reservationSettingsService = createReservationSettingsService()
