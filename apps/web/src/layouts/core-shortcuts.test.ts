import { describe, expect, it } from 'vitest'
import { coreShortcutsFor } from './core-shortcuts'

describe('core shortcuts', () => {
  it('gives the library workspace direct links to setup, fines, reservation maintenance and the pickup window', () => {
    const paths = coreShortcutsFor('librarian', { auditLogs: 0, queued: 0 }).map(item => [item.title, item.path])
    expect(paths).toEqual(expect.arrayContaining([
      ['Library setup', '/librarian/maintenance'],
      ['Issue fines', '/librarian/fines?tab=violations&record=1'],
      ['Reservation maintenance', '/librarian/maintenance?tab=reservations'],
      ['Pickup window', '/librarian/maintenance?tab=reservations#pickup-window'],
    ]))
    expect(new Set(paths.map(([, path]) => path)).size).toBe(paths.length)
  })
  it('never links Admin or Staff to library-setup pages their role cannot open', () => {
    for (const role of ['admin', 'staff'] as const) {
      const paths = coreShortcutsFor(role, { auditLogs: 0, queued: 0 }).map(item => item.path)
      expect(paths.some(path => path.includes('/maintenance') || path.includes('/fines'))).toBe(false)
    }
  })
})
