import session from 'express-session'
import { env } from '../config/env.js'

function getExpiry(sessionData) {
  const cookieExpiry = sessionData.cookie?.expires
  if (cookieExpiry) return new Date(cookieExpiry).getTime()
  return Date.now() + Number(sessionData.cookie?.maxAge ?? 30 * 60 * 1000)
}

const upsertSql = env.db.driver === 'postgres'
  ? `INSERT INTO auth_sessions (session_id, session_data, expires_at, updated_at)
     VALUES (?, ?, ?, NOW())
     ON CONFLICT (session_id) DO UPDATE SET
       session_data = EXCLUDED.session_data,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`
  : `INSERT INTO auth_sessions (session_id, session_data, expires_at, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       session_data = VALUES(session_data),
       expires_at = VALUES(expires_at),
       updated_at = NOW()`

/**
 * Server-side session store backed by auth_sessions.
 * Uses Postgres ON CONFLICT when DATABASE_URL is set; MySQL upsert otherwise.
 */
export class MySqlSessionStore extends session.Store {
  constructor(pool) {
    super()
    this.pool = pool
    this.cleanupTimer = setInterval(() => {
      this.pool.execute('DELETE FROM auth_sessions WHERE expires_at <= ?', [Date.now()]).catch((error) => {
        console.error('Expired-session cleanup failed:', error)
      })
    }, 15 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  get(sessionId, callback) {
    this.pool
      .execute(
        'SELECT session_data FROM auth_sessions WHERE session_id = ? AND expires_at > ? LIMIT 1',
        [sessionId, Date.now()],
      )
      .then(([rows]) => {
        if (!Array.isArray(rows) || rows.length === 0) return callback(null, null)
        try {
          return callback(null, JSON.parse(rows[0].session_data))
        } catch (error) {
          return callback(error)
        }
      })
      .catch(callback)
  }

  set(sessionId, sessionData, callback = () => {}) {
    const serialized = JSON.stringify(sessionData)
    this.pool
      .execute(upsertSql, [sessionId, serialized, getExpiry(sessionData)])
      .then(() => callback(null))
      .catch(callback)
  }

  destroy(sessionId, callback = () => {}) {
    this.pool
      .execute('DELETE FROM auth_sessions WHERE session_id = ?', [sessionId])
      .then(() => callback(null))
      .catch(callback)
  }

  touch(sessionId, sessionData, callback = () => {}) {
    this.pool
      .execute('UPDATE auth_sessions SET expires_at = ?, updated_at = NOW() WHERE session_id = ?', [
        getExpiry(sessionData),
        sessionId,
      ])
      .then(() => callback(null))
      .catch(callback)
  }
}
