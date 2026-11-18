// Read-only: run against Supabase only with Ethan's go-ahead (`npm run db:check-rls -w @sti-library/api`).
// Use a direct or session-pooler connection; the transaction pooler (port 6543) can drop the session setting below.
import pg from 'pg'
import { env } from '../src/config/env.js'
import { checkRowLevelSecurity } from '../src/core/rls-check.ts'

const client = new pg.Client({ connectionString: env.db.connectionString })
try {
  await client.connect()
  await client.query('SET default_transaction_read_only = on')
  const result = await checkRowLevelSecurity(client)
  for (const role of result.missingRoles) console.error(`Role missing: ${role} (is this a Supabase database?)`)
  for (const table of result.tablesWithoutRls) console.error(`RLS off: public.${table}`)
  for (const grant of result.exposedGrants) console.error(`Privilege held: ${grant}`)
  console.log(result.ok ? 'RLS check passed: every public table has RLS; anon and authenticated hold no table or column privileges.' : 'RLS check FAILED.')
  process.exitCode = result.ok ? 0 : 2
} catch (error) {
  // Message only: a stack or connection error object can carry the host.
  console.error(`RLS check could not run: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
