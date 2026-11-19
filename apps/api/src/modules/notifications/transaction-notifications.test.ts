import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { notifyStaffRoles, notifyStaffRolesSafe } from './transaction-notifications.ts'
import { insertUserNotice } from './user-notices.ts'

test('transaction notifications deliver to the patron user AND all active Librarian, Staff, and Admin accounts', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`
      CREATE TABLE users(
        user_id BIGINT PRIMARY KEY,
        full_name TEXT NOT NULL,
        school_id TEXT NOT NULL,
        account_status TEXT NOT NULL DEFAULT 'Active'
      );
      CREATE TABLE accounts(
        account_id BIGINT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        role TEXT NOT NULL,
        account_status TEXT NOT NULL DEFAULT 'Active'
      );
      CREATE TABLE notifications(
        notification_id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        message_title VARCHAR(150) NOT NULL,
        message_body TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        source_type TEXT,
        source_id BIGINT,
        action_path TEXT,
        priority TEXT NOT NULL DEFAULT 'Normal',
        dedupe_key TEXT NOT NULL,
        scheduled_for TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        notification_timestamp TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, dedupe_key)
      );
      INSERT INTO users VALUES
        (1, 'Maria Librarian', 'LIB-001', 'Active'),
        (2, 'Jose Staff', 'STF-001', 'Active'),
        (3, 'Ana Admin', 'ADM-001', 'Active'),
        (4, 'Juan Student', '02000123456', 'Active'),
        (5, 'Inactive Staff', 'STF-002', 'Suspended');
      INSERT INTO accounts VALUES
        (10, 1, 'Librarian', 'Active'),
        (20, 2, 'Staff', 'Active'),
        (30, 3, 'Admin', 'Active'),
        (40, 4, 'Student', 'Active'),
        (50, 5, 'Staff', 'Suspended');
    `)
    const executor = {
      execute: async (sql: string, args: unknown[] = []) => {
        const result = await pg.query(toPgPlaceholders(sql), args)
        return [result.rows, result]
      },
    }

    await insertUserNotice(executor as never, {
      userId: 4,
      title: 'Borrow confirmed',
      body: 'Clean Code is due tomorrow.',
      triggerType: 'Due Date',
      sourceType: 'Borrow Transaction',
      sourceId: 99,
      actionPath: '/student/my-books',
      priority: 'Normal',
      dedupeKey: 'loan:99:borrowed',
    })
    await notifyStaffRoles(executor as never, {
      key: 'loan:99:borrowed',
      title: 'Book checked out',
      body: 'Clean Code checked out.',
      type: 'Due Date',
      sourceType: 'Borrow Transaction',
      sourceId: 99,
      personUserId: 4,
      librarianPath: '/librarian/circulation',
      staffPath: '/staff/circulation',
      priority: 'Normal',
    })

    const rows = (
      await pg.query<{ user_id: string; message_title: string; message_body: string; action_path: string }>(
        'SELECT user_id, message_title, message_body, action_path FROM notifications ORDER BY user_id',
      )
    ).rows

    // All 4 active parties receive notifications: Librarian (1), Staff (2), Admin (3), Student (4) — suspended Staff (5) does NOT
    assert.deepEqual(
      rows.map((r) => Number(r.user_id)),
      [1, 2, 3, 4],
    )
    assert.equal(rows[0].action_path, '/librarian/circulation')
    assert.equal(rows[1].action_path, '/staff/circulation')
    assert.equal(rows[2].action_path, '/admin/audit-logs')
    assert.equal(rows[3].action_path, '/student/my-books')
    assert.match(rows[0].message_body, /Juan Student \(02000123456\): Clean Code checked out\./)

    // Calling again with same dedupe key does not duplicate
    await notifyStaffRolesSafe(executor as never, {
      key: 'loan:99:borrowed',
      title: 'Book checked out',
      body: 'Clean Code checked out.',
      type: 'Due Date',
      sourceType: 'Borrow Transaction',
      sourceId: 99,
      personUserId: 4,
      librarianPath: '/librarian/circulation',
      staffPath: '/staff/circulation',
      priority: 'Normal',
    })
    const after = (await pg.query('SELECT * FROM notifications')).rows
    assert.equal(after.length, 4)
  } finally {
    await pg.close()
  }
})
