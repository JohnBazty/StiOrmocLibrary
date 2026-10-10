import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { isPostgres } from '../../config/sql-dialect.js'

const clearOtherSessionsSql = isPostgres
  ? `DELETE FROM auth_sessions
      WHERE session_id <> ?
        AND (session_data::json->'user'->>'id')::int = ?`
  : `DELETE FROM auth_sessions
      WHERE session_id <> ?
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.user.id')) AS UNSIGNED) = ?`

const clearAllSessionsSql = isPostgres
  ? `DELETE FROM auth_sessions
      WHERE (session_data::json->'user'->>'id')::int = ?`
  : `DELETE FROM auth_sessions
      WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.user.id')) AS UNSIGNED) = ?`

export type AuthSessionRepository = {
  incrementAuthVersionForAccount(accountId: number): Promise<number>
  incrementAuthVersionForUser(userId: number): Promise<number>
  clearOtherSessions(userId: number, currentSessionId: string): Promise<void>
  clearAllSessionsForUser(userId: number): Promise<void>
}

/**
 * Single-session helpers: bump auth_version on login so prior JWTs die,
 * and prune sibling cookie rows in auth_sessions.
 */
export function createAuthSessionRepository(database: Pool = db): AuthSessionRepository {
  async function bumpLinkedVersions(
    connection: PoolConnection,
    accountId: number | null,
    userId: number | null,
  ): Promise<number> {
    if (accountId) {
      await connection.execute(
        'UPDATE accounts SET auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?',
        [accountId],
      )
    }
    if (userId) {
      await connection.execute(
        'UPDATE users SET auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?',
        [userId],
      )
    }

    if (accountId) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT auth_version FROM accounts WHERE account_id=? LIMIT 1',
        [accountId],
      )
      return Number(rows[0]?.auth_version ?? 1)
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT auth_version FROM users WHERE user_id=? LIMIT 1',
      [userId],
    )
    return Number(rows[0]?.auth_version ?? 1)
  }

  return {
    async incrementAuthVersionForAccount(accountId: number): Promise<number> {
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [accounts] = await connection.execute<RowDataPacket[]>(
          'SELECT account_id,user_id FROM accounts WHERE account_id=? FOR UPDATE',
          [accountId],
        )
        const account = accounts[0]
        if (!account) {
          await connection.rollback()
          return 1
        }
        const next = await bumpLinkedVersions(
          connection,
          accountId,
          account.user_id ? Number(account.user_id) : null,
        )
        await connection.commit()
        return next
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async incrementAuthVersionForUser(userId: number): Promise<number> {
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [users] = await connection.execute<RowDataPacket[]>(
          'SELECT user_id FROM users WHERE user_id=? FOR UPDATE',
          [userId],
        )
        if (!users[0]) {
          await connection.rollback()
          return 1
        }
        const [accounts] = await connection.execute<RowDataPacket[]>(
          'SELECT account_id FROM accounts WHERE user_id=? LIMIT 1 FOR UPDATE',
          [userId],
        )
        const next = await bumpLinkedVersions(
          connection,
          accounts[0]?.account_id ? Number(accounts[0].account_id) : null,
          userId,
        )
        await connection.commit()
        return next
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async clearOtherSessions(userId: number, currentSessionId: string): Promise<void> {
      if (!currentSessionId) return
      await database.execute(clearOtherSessionsSql, [currentSessionId, userId])
    },

    async clearAllSessionsForUser(userId: number): Promise<void> {
      await database.execute(clearAllSessionsSql, [userId])
    },
  }
}

export const authSessionRepository = createAuthSessionRepository()
