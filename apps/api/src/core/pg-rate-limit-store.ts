import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit'
import type { Pool } from '../config/db.js'

type HitRow = { hits: number; reset_at: Date }

const SWEEP_EVERY_MS = 60 * 60_000

/** express-rate-limit store backed by Postgres, so every API instance shares one budget per client. */
export class PgRateLimitStore implements Store {
  localKeys = false
  private windowMs = 60_000
  private lastSweep = Number.NEGATIVE_INFINITY
  readonly prefix: string
  private readonly pool: Pool
  private readonly clock: () => number

  constructor(prefix: string, pool: Pool, clock: () => number = Date.now) {
    this.prefix = prefix
    this.pool = pool
    this.clock = clock
  }

  // Clients that never return leave rows behind; each instance clears them at most once an hour.
  private async sweep() {
    if (this.clock() - this.lastSweep < SWEEP_EVERY_MS) return
    this.lastSweep = this.clock()
    try {
      await this.pool.execute("DELETE FROM rate_limit_hits WHERE reset_at < NOW() - INTERVAL '1 day'", [])
    } catch (error) {
      console.error('[rate-limit] Could not delete expired rate-limit rows.', error)
    }
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
    await this.sweep()
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
