import type { Pool, PoolConnection } from '../../config/db.js'

type Executor = Pick<Pool | PoolConnection, 'execute'>

/**
 * Runs optional notification work without risking the caller's transaction.
 *
 * In Postgres a failed statement aborts the whole transaction, and a later COMMIT then
 * silently rolls every earlier write back. Inside a transaction the work runs under a
 * savepoint, so a failure undoes only the notification. Outside a transaction the
 * SAVEPOINT is rejected without side effects and the work runs directly.
 */
export async function bestEffort(executor: Executor, name: string, work: () => Promise<unknown>): Promise<void> {
  const savepoint = `best_effort_${name}`
  const inTransaction = await executor.execute(`SAVEPOINT ${savepoint}`).then(() => true, () => false)
  try {
    await work()
    if (inTransaction) await executor.execute(`RELEASE SAVEPOINT ${savepoint}`)
  } catch {
    // Notifications are best effort; undo only this notification work.
    if (inTransaction) await executor.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }
}
