import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit'
import type { Pool } from '../config/db.js'

type HitRow = { hits: number; reset_at: Date }

/**
 * express-rate-limit store backed by Postgres, so every API instance shares one budget per client.
 * shortcut: expired rows are overwritten on the client's next hit but never deleted; add a cleanup job if the table grows large.
 */
export class PgRateLimitStore implements Store {
  localKeys = false
  private windowMs = 60_000
  readonly prefix: string
  private readonly pool: Pool

  constructor(prefix: string, pool: Pool) {
    this.prefix = prefix
    this.pool = pool
  }

  init(options: Options) {
    this.windowMs = options.windowMs
  }

  private bucket(key: string) {
    return `${this.prefix}:${key}`
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const [rows] = await this.pool.execute<HitRow[]>(
      'SELECT hits, reset_at FROM rate_limit_hits WHERE bucket_key = ? AND reset_at > NOW()', [this.bucket(key)])
    const row = (rows as HitRow[])[0]
    return row ? { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) } : undefined
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    // One atomic upsert on the database clock: concurrent instances cannot lose hits or disagree on the window.
    const [result] = await this.pool.execute(
      `INSERT INTO rate_limit_hits (bucket_key, hits, reset_at)
       VALUES (?, 1, NOW() + make_interval(secs => ?::double precision / 1000))
       ON CONFLICT (bucket_key) DO UPDATE SET
         hits = CASE WHEN rate_limit_hits.reset_at <= NOW() THEN 1 ELSE rate_limit_hits.hits + 1 END,
         reset_at = CASE WHEN rate_limit_hits.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE rate_limit_hits.reset_at END
       RETURNING hits, reset_at`,
      [this.bucket(key), this.windowMs])
    const row = (result as unknown as { rows: HitRow[] }).rows[0]
    return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) }
  }

  async decrement(key: string) {
    await this.pool.execute(
      'UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE bucket_key = ? AND reset_at > NOW()', [this.bucket(key)])
  }

  async resetKey(key: string) {
    await this.pool.execute('DELETE FROM rate_limit_hits WHERE bucket_key = ?', [this.bucket(key)])
  }
}
