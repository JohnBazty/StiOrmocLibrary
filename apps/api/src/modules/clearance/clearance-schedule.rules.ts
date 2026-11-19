import { HttpError } from '../../core/http-error.ts'

export const CLEARANCE_GROUPS = ['All', 'BSIT', 'BSHM', 'BSTM', 'Grade 11', 'Grade 12'] as const
export type ClearanceGroup = typeof CLEARANCE_GROUPS[number]
export type ScheduleWindow = {
  id: number; group: ClearanceGroup; startsAt: string; endsAt: string; version: number
  status: 'Upcoming' | 'Open' | 'Closed'
}
export function scheduleStatus(startsAt: string, endsAt: string, now: Date): ScheduleWindow['status'] {
  return now.getTime() < Date.parse(startsAt) ? 'Upcoming' : now.getTime() >= Date.parse(endsAt) ? 'Closed' : 'Open'
}
export function studentClearanceGroup(program: unknown, level: unknown): ClearanceGroup | null {
  const normalize = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const grade = normalize(level)
  if (['11', 'GRADE11', 'G11', 'GR11'].includes(grade)) return 'Grade 11'
  if (['12', 'GRADE12', 'G12', 'GR12'].includes(grade)) return 'Grade 12'
  const programs: Record<string, ClearanceGroup> = {
    BSIT: 'BSIT', BSHM: 'BSHM', BSTM: 'BSTM',
    BSINFORMATIONTECHNOLOGY: 'BSIT', BSHOSPITALITYMANAGEMENT: 'BSHM', BSTOURISMMANAGEMENT: 'BSTM',
    BACHELOROFSCIENCEININFORMATIONTECHNOLOGY: 'BSIT',
    BACHELOROFSCIENCEINHOSPITALITYMANAGEMENT: 'BSHM',
    BACHELOROFSCIENCEINTOURISMMANAGEMENT: 'BSTM',
  }
  return programs[normalize(program)] ?? null
}
/** A specific group owns its semester calendar; All is the fallback for other students. */
export function applicableWindows(windows: ScheduleWindow[], group: ClearanceGroup | null) {
  const own = group ? windows.filter(window => window.group === group) : []
  return (own.length ? own : windows.filter(window => window.group === 'All'))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id)
}
export function selectedWindow(windows: ScheduleWindow[], now: Date) {
  return windows.find(window => scheduleStatus(window.startsAt, window.endsAt, now) === 'Open')
    ?? windows.find(window => scheduleStatus(window.startsAt, window.endsAt, now) === 'Upcoming')
    ?? windows.at(-1) ?? null
}
function invalid(message = 'Choose a group and a valid opening and closing time.') {
  return new HttpError(422, 'SCHEDULE_INVALID', message)
}
export function scheduleId(value: unknown) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw invalid('Choose an existing schedule.')
  return Number(value)
}
/** Positive IDs refer to legacy terms; negative IDs identify existing enrollment semesters. */
export function scheduleTermId(value: unknown) {
  if (!['string', 'number'].includes(typeof value) || !/^-?[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw invalid('Choose an existing semester.')
  return Number(value)
}
export function scheduleVersion(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid('Reload the schedule before saving.')
  return value
}
function instant(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value)) throw invalid()
  const time = new Date(value), day = new Date(value.slice(0, 10) + 'T00:00:00Z')
  if (!Number.isFinite(time.getTime()) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) throw invalid()
  return time.toISOString()
}
export function validateSchedule(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid()
  const input = body as Record<string, unknown>
  const termId = scheduleTermId(input.termId), id = input.id == null ? null : scheduleId(input.id)
  const version = scheduleVersion(input.version)
  if (!CLEARANCE_GROUPS.includes(input.group as ClearanceGroup) || (id === null ? version !== 0 : version < 1)) throw invalid()
  const startsAt = instant(input.startsAt), endsAt = instant(input.endsAt)
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw invalid('Closing time must be after opening time.')
  const requestKey = typeof input.requestKey === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestKey) ? input.requestKey : null
  if (id === null && !requestKey) throw invalid('Reload the form before adding a schedule.')
  return { termId, id, version, group: input.group as ClearanceGroup, startsAt, endsAt, requestKey }
}
