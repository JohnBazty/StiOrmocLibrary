import type { Pool, ResultSetHeader } from '../../config/db.js'

/** A revoked session's rows stay this long, so a phone that retries after a revoke still gets a clear reuse/invalid answer. */
export const REVOKED_FAMILY_KEEP_MS = 7 * 24 * 60 * 60_000
const PURGE_BATCH_SIZE = 500
const PURGE_MAX_BATCHES = 10

/**
 * Deletes only rows of a dead family: the family deadline (expires_at) has passed, or its session was revoked
 * longer ago than REVOKED_FAMILY_KEEP_MS. Rotated rows of a LIVE family are never deleted: reuse detection
 * needs them, and removing one would make a replayed old token look unknown instead of revoking the family.
 * Both cut-offs come from the passed-in `now`, not SQL NOW(), like the refresh service itself.
 * Deletes in LIMIT batches, each its own short statement; the next minute's run continues a larger backlog.
 */
export async function purgeMobileRefreshTokens(database: Pool, now: Date, { batchSize = PURGE_BATCH_SIZE, maxBatches = PURGE_MAX_BATCHES } = {}) {
  const revokedBefore = new Date(now.getTime() - REVOKED_FAMILY_KEEP_MS)
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    const [header] = await database.execute<ResultSetHeader>(
      `DELETE FROM mobile_refresh_tokens WHERE token_hash IN (
         SELECT t.token_hash FROM mobile_refresh_tokens t
          WHERE t.expires_at < ? OR EXISTS (SELECT 1 FROM library_login_sessions s WHERE s.session_id = t.session_id AND s.revoked_at < ?)
          LIMIT ?)`,
      [now, revokedBefore, batchSize])
    deleted += header.affectedRows
    if (header.affectedRows < batchSize) break
  }
  return { deleted }
}
