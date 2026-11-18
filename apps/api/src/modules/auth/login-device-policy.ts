import { createHmac, randomBytes } from 'node:crypto'
import { dbDriver } from '../../config/db.js'
import { env } from '../../config/env.js'

export const LOGIN_IDLE_MS = 10 * 60_000
export const REMEMBER_DEVICE_MS = 7 * 24 * 60 * 60_000
export const SWITCH_DEVICE_MS = 2 * 60_000
export const loginDevicesEnabled = () => dbDriver === 'postgres' && process.env.LOGIN_DEVICES_ENABLED === 'true'

export const DEVICE_IDLE_SQL = "last_activity_at>NOW()-INTERVAL '10 minutes'"
export const DEVICE_DEADLINE_SQL = '(remembered_until IS NULL OR remembered_until>NOW())'
export const LIVE_DEVICE_SQL = `((remembered_until IS NULL AND ${DEVICE_IDLE_SQL}) OR remembered_until>NOW())`

export const makeDeviceToken = () => randomBytes(32).toString('base64url')
export const isDeviceSessionId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
export const isDeviceToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
export const deviceTokenHash = (kind: 'browser' | 'switch', token: string) =>
  createHmac('sha256', env.jwt.secret).update(`login-device:${kind}:${token}`).digest('hex')
