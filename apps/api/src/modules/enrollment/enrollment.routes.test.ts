import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createEnrollmentRouter } from './enrollment.routes.ts'

const form = {
  schoolId: '0000100',
  firstName: 'Test',
  lastName: 'Student',
  program: 'BSIT',
  yearLevel: '1Y',
  email: '',
  sourceDate: '2026-11-18',
}

test('only Librarian and Admin can review or save late enrollment', async () => {
  for (const role of ['Librarian', 'Admin', 'Staff', 'Student', 'Faculty']) {
    const calls: unknown[][] = []
    const service = {
      reviewLateEnrollment: async (...args: unknown[]) => { calls.push(args); return { added: 1 } },
      saveLateEnrollment: async (...args: unknown[]) => { calls.push(args); return { added: 1 } },
    }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 3, role }; next() })
    app.use(createEnrollmentRouter(service as never))
    const url = '/semesters/7/late-enrollment'
    const review = await request(app).post(url + '/review').send(form)
    const save = await request(app).post(url).field('sourceDate', form.sourceDate).field('confirmed', 'true')
      .field('reviewToken', 'test-review-token').attach('roster', Buffer.from('Student ID\n0000100'), 'synthetic.csv')
    const allowed = role === 'Librarian' || role === 'Admin'
    assert.equal(review.status, allowed ? 200 : 403, role)
    assert.equal(save.status, allowed ? 200 : 403, role)
    assert.equal(calls.length, allowed ? 2 : 0)
    if (allowed) {
      assert.equal(review.headers['cache-control'], 'private, no-store')
      assert.equal(save.headers['cache-control'], 'private, no-store')
      assert.deepEqual(calls[0], [3, '7', undefined, form])
      assert.deepEqual(calls[1].slice(0, 2), [3, '7'])
      assert.equal((calls[1][2] as Express.Multer.File).originalname, 'synthetic.csv')
      assert.deepEqual({ ...(calls[1][3] as object) }, { sourceDate: form.sourceDate, confirmed: 'true', reviewToken: 'test-review-token' })
    }
  }
})
