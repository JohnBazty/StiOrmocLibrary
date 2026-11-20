import { Check, Circle, CircleDot } from 'lucide-react'
import { warningName, type Standing } from './violations-api'

const when = (value: string) => new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
const peso = (value: number) => `PHP ${value.toFixed(2)}`

/** Which warning a record saved now would be (0-based). It comes from the step the server will save, never from a count. */
const WARNING_STEPS = ['First warning', 'Second warning', 'Final warning']
function warningIndex(standing: Standing) {
  return Math.max(0, WARNING_STEPS.indexOf(standing.nextStep))
}
const isFine = (standing: Standing) => standing.nextStep === 'Fine'

function stepNames(standing: Standing) {
  const warnings = standing.role === 'Faculty' ? 0 : standing.warningsBeforeFine
  return [...Array.from({ length: warnings }, (_, index) => warningName(index)), 'Fine']
}

export function standingMessage(standing: Standing) {
  const noCharge = 'No charge; borrowing and clearance are not affected.'
  if (standing.fromPaperLog) return 'Copying an earlier warning from the paper log. No charge and no message to the person.'
  if (isFine(standing)) {
    if (standing.role === 'Faculty') return 'Faculty go straight to the fine.'
    const threshold = standing.warningsBeforeFine
    if (threshold === 0) return 'This category has no warnings. This record is a fine.'
    return `${threshold === 1 ? 'The warning is' : threshold === 2 ? 'Both warnings are' : `All ${threshold} warnings are`} used. This record is a fine.`
  }
  const noHistory = standing.warningsUsed === 0 && standing.history.length === 0 && !standing.earlierWarnings
  return `${noHistory ? 'No earlier records in this category. ' : ''}This will be the ${warningName(warningIndex(standing))}. ${noCharge}`
}

export function recordButtonLabel(standing: Standing) {
  if (isFine(standing)) return `Record fine ${peso(standing.amount ?? standing.fineAmount)}`
  return `Record ${warningName(warningIndex(standing))}${standing.fromPaperLog ? ' from paper log' : ''}`
}

/** The review: done steps, the step this record will be, and what comes later. Symbols and words, never color alone. */
export function ViolationProgress({ standing }: { standing: Standing }) {
  const names = stepNames(standing)
  const current = isFine(standing) ? names.length - 1 : warningIndex(standing)
  return (
    <div className="space-y-3">
      <ol aria-label="Steps toward a fine" className="flex flex-wrap items-center gap-2 text-sm">
        {names.map((name, index) => {
          const state = index < current ? 'Done' : index === current ? 'This record' : 'Later'
          const Icon = state === 'Done' ? Check : state === 'This record' ? CircleDot : Circle
          return (
            <li key={name} aria-current={state === 'This record' ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${state === 'This record'
                ? 'border-[#0b5ea2] bg-[#0b5ea2] font-bold text-white'
                : 'border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] text-[var(--sl-text-secondary)]'}`}>
              <Icon size={14} aria-hidden="true" />
              <span>{name}</span>
              <span className="text-xs font-semibold opacity-80">{state}</span>
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-[var(--sl-text-header)]">{standingMessage(standing)}</p>
      {standing.earlierWarnings || standing.history.length ? (
        <div className="text-xs text-[var(--sl-text-secondary)]">
          {standing.earlierWarnings ? (
            <p>{standing.earlierWarnings.count} earlier warning{standing.earlierWarnings.count === 1 ? '' : 's'} (reviewed {when(standing.earlierWarnings.reviewedAt)})</p>
          ) : null}
          {standing.history.length ? (
            <ul aria-label="Earlier records in this category" className="mt-1 space-y-0.5">
              {standing.history.map(item => (
                <li key={item.incidentId} aria-label={`${item.step} on ${when(item.date)}${item.source === 'Paper log' ? ', from the paper log' : ''}`}>
                  {item.step} · {when(item.date)}{item.source === 'Paper log' ? <> · <span className="font-semibold">Paper log</span></> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
