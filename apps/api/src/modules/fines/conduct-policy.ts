export type ConductAction = 'First warning' | 'Second warning' | 'Final warning' | `Warning ${number}` | 'Fine'

export const MAX_WARNINGS_BEFORE_FINE = 99

export const STUDENT_LEVELS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'] as const
export type StudentLevel = (typeof STUDENT_LEVELS)[number]
export type LevelWarningsMap = Partial<Record<StudentLevel, number>>

/** Normalizes student year/grade level strings from student_profiles, enrollment rosters, or users.educational_level. */
export function normalizeStudentLevel(raw: unknown): StudentLevel | null {
  if (typeof raw !== 'string') return null
  const compact = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!compact) return null
  if (['11', 'GRADE11', 'G11', 'GR11'].includes(compact)) return 'Grade 11'
  if (['12', 'GRADE12', 'G12', 'GR12'].includes(compact)) return 'Grade 12'
  if (['1', '1ST', '1STYEAR', 'FIRSTYEAR', 'YEAR1', '1Y', '1Y1', '1Y2', '1Y3'].includes(compact)) return '1st Year'
  if (['2', '2ND', '2NDYEAR', 'SECONDYEAR', 'YEAR2', '2Y', '2Y1', '2Y2', '2Y3'].includes(compact)) return '2nd Year'
  if (['3', '3RD', '3RDYEAR', 'THIRDYEAR', 'YEAR3', '3Y', '3Y1', '3Y2', '3Y3'].includes(compact)) return '3rd Year'
  if (['4', '4TH', '4THYEAR', 'FOURTHYEAR', 'YEAR4', '4Y', '4Y1', '4Y2', '4Y3'].includes(compact)) return '4th Year'
  return null
}

/** Resolves the applicable shared warning threshold for a person using the library-wide default or per-level override. */
export function resolveWarningsBeforeFine(
  defaultWarnings: number,
  levelWarnings: LevelWarningsMap | null | undefined,
  studentLevel: StudentLevel | null,
): number {
  if (studentLevel && levelWarnings && typeof levelWarnings[studentLevel] === 'number') {
    const custom = levelWarnings[studentLevel]!
    if (Number.isInteger(custom) && custom >= 0 && custom <= MAX_WARNINGS_BEFORE_FINE) return custom
  }
  return defaultWarnings
}

/** Offense number (count + 1) decides the step: warnings come first, the offense after them is a fine.
 * `previousIncidents` is the person's total counted violations across all categories; `warningsBeforeFine` comes from Library setup.
 */
/** Faculty get the same warnings but never a fine: where a student would be fined, a faculty member gets a final warning. */
export function facultyConductAction(previousIncidents: number, warningsBeforeFine: number): ConductAction {
  const step = conductAction(previousIncidents, warningsBeforeFine)
  return step === 'Fine' ? 'Final warning' : step
}

export function conductAction(previousIncidents: number, warningsBeforeFine: number): ConductAction {
  if (!Number.isSafeInteger(previousIncidents) || previousIncidents < 0) {
    throw new RangeError('The qualifying incident count must be a nonnegative safe integer.')
  }
  if (!Number.isInteger(warningsBeforeFine) || warningsBeforeFine < 0 || warningsBeforeFine > MAX_WARNINGS_BEFORE_FINE) {
    throw new RangeError(`Warnings before a fine must be a whole number from 0 to ${MAX_WARNINGS_BEFORE_FINE}.`)
  }
  if (previousIncidents >= warningsBeforeFine) return 'Fine'
  if (previousIncidents === 0) return 'First warning'
  if (previousIncidents === 1) return 'Second warning'
  if (previousIncidents === warningsBeforeFine - 1) return 'Final warning'
  return `Warning ${previousIncidents + 1}`
}
