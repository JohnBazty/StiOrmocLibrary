export type ConductAction = 'First warning' | 'Second warning' | 'Final warning' | 'Fine'

export const MAX_WARNINGS_BEFORE_FINE = 3

/** Offense number (count + 1) decides the step: warnings come first, the offense after them is a fine.
 * `previousIncidents` is the person's counted warnings in this category; `warningsBeforeFine` comes from Library setup.
 * Faculty skip the warnings; the caller passes `warningsBeforeFine` of 0 for them.
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
    throw new RangeError('Warnings before a fine must be a whole number from 0 to 3.')
  }
  if (previousIncidents >= warningsBeforeFine) return 'Fine'
  // 'Final warning' is only the third step when a category allows three warnings.
  return (['First warning', 'Second warning', 'Final warning'] as const)[previousIncidents]
}
