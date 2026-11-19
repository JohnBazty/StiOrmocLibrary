export type ConductAction = 'First warning' | 'Second warning' | 'Final warning' | 'Eligible for fine review'

/** The caller supplies reviewed qualifying history under the approved scope/reset policy.
 * Eligibility never issues a charge; assessment requires a separate librarian review.
 */
export function conductAction(previousQualifyingIncidents: number): ConductAction {
  if (!Number.isSafeInteger(previousQualifyingIncidents) || previousQualifyingIncidents < 0) {
    throw new RangeError('The qualifying incident count must be a nonnegative safe integer.')
  }
  const warnings: ConductAction[] = ['First warning', 'Second warning', 'Final warning']
  return warnings[previousQualifyingIncidents] ?? 'Eligible for fine review'
}
