import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const file = (name: string) => readFileSync(new URL(`../../../../../database/supabase/${name}`, import.meta.url), 'utf8')

async function database() {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE borrowing_policy_versions (
      borrowing_policy_version_id BIGSERIAL PRIMARY KEY, effective_on DATE NOT NULL,
      student_max_active_books INTEGER NOT NULL, faculty_max_active_books INTEGER NULL, borrowing_days INTEGER NOT NULL,
      due_time_cutoff TIME NOT NULL, max_renewals INTEGER NOT NULL, renewal_extension_days INTEGER NOT NULL,
      student_max_active_reservations INTEGER NOT NULL, faculty_max_active_reservations INTEGER NULL,
      block_renewal_if_overdue BOOLEAN NOT NULL DEFAULT TRUE, block_renewal_if_unpaid_fines BOOLEAN NOT NULL DEFAULT TRUE,
      block_renewal_if_reserved BOOLEAN NOT NULL DEFAULT TRUE, long_overdue_after_days INTEGER NULL,
      change_reason VARCHAR(500) NOT NULL, created_by_user_id BIGINT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW());
    CREATE TABLE borrowing_policy_material_rules (borrowing_policy_version_id BIGINT NOT NULL REFERENCES borrowing_policy_versions,
      material_type VARCHAR(40) NOT NULL, is_borrowable BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (borrowing_policy_version_id, material_type));
    INSERT INTO borrowing_policy_versions (effective_on, student_max_active_books, faculty_max_active_books, borrowing_days, due_time_cutoff,
      max_renewals, renewal_extension_days, student_max_active_reservations, faculty_max_active_reservations, long_overdue_after_days, change_reason)
      VALUES ('2000-01-01', 2, NULL, 1, '08:59', 1, 1, 2, NULL, NULL, 'Legacy'),
             ('2026-11-01', 3, NULL, 2, '08:59', 3, 2, 4, 6, 30, 'Current');
    INSERT INTO borrowing_policy_material_rules VALUES (2, 'Book', TRUE), (2, 'Thesis/Manuscript', FALSE), (2, 'Magazine', TRUE);`)
  await pg.exec(file('041_checkout_opens_at.sql'))
  return pg
}

test('042 publishes the Librarian rules as a new version based on the active one, once', async () => {
  const pg = await database()
  await pg.exec(file('042_librarian_borrowing_rules.sql'))
  await pg.exec(file('042_librarian_borrowing_rules.sql'))

  const { rows } = await pg.query<Record<string, unknown>>(`SELECT *, effective_on = (NOW() AT TIME ZONE 'Asia/Manila')::date AS today
    FROM borrowing_policy_versions WHERE borrowing_policy_version_id > 2`)
  assert.equal(rows.length, 1, 'running twice adds one version')
  const v = rows[0]
  assert.equal(v.today, true)
  assert.deepEqual([v.student_max_active_books, v.faculty_max_active_books, v.borrowing_days, v.due_time_cutoff, v.checkout_opens_at], [2, 5, 1, '08:00:00', '14:00:00'])
  assert.deepEqual([v.max_renewals, v.renewal_extension_days, v.student_max_active_reservations, v.faculty_max_active_reservations, v.long_overdue_after_days], [3, 2, 4, 6, 30], 'other values copied from the active version')

  const rules = await pg.query<{ material_type: string; is_borrowable: boolean }>(`SELECT material_type, is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id = $1 ORDER BY material_type`, [v.borrowing_policy_version_id])
  assert.deepEqual(rules.rows, [{ material_type: 'Book', is_borrowable: true }, { material_type: 'Magazine', is_borrowable: true }, { material_type: 'Thesis/Manuscript', is_borrowable: false }])
  await pg.close()
})

test('042 refuses to run when a future-dated version would later replace the rules', async () => {
  const pg = await database()
  await pg.exec(`INSERT INTO borrowing_policy_versions (effective_on, student_max_active_books, borrowing_days, due_time_cutoff, max_renewals, renewal_extension_days, student_max_active_reservations, change_reason)
    VALUES ('2099-01-01', 3, 1, '08:59', 1, 1, 2, 'Scheduled')`)
  await assert.rejects(pg.exec(file('042_librarian_borrowing_rules.sql')), /future-dated borrowing policy/)
  const { rows } = await pg.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM borrowing_policy_versions')
  assert.equal(rows[0].n, 3, 'nothing inserted')
  await pg.close()
})
