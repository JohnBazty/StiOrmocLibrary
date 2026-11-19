import { AlertCircle, AlertTriangle, BookOpen, CheckCircle2, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from '../../components/ui'
import type { LookupResult } from './stocktake-api'

export type ObservedCondition = 'good' | 'fair' | 'for_repair' | 'damaged'
type Option = {
  value: ObservedCondition
  label: string
  hint: (kind: 'book' | 'research') => string
  badgeTone: 'success' | 'warning' | 'error'
}

const OPTIONS: Option[] = [
  {
    value: 'good',
    label: 'Good',
    hint: () => 'No problems. Only the count is recorded.',
    badgeTone: 'success',
  },
  {
    value: 'fair',
    label: 'Worn but usable',
    hint: () => 'Still fine to lend. Only the count is recorded.',
    badgeTone: 'warning',
  },
  {
    value: 'for_repair',
    label: 'Damaged, can be repaired',
    hint: kind =>
      kind === 'book'
        ? 'Marked For Repair and saved to Books in repair.'
        : 'Marked For Repair in research inventory.',
    badgeTone: 'error',
  },
  {
    value: 'damaged',
    label: 'Damaged beyond repair',
    hint: kind =>
      kind === 'book'
        ? 'Marked Damaged and saved to Damaged copies.'
        : 'Marked Damaged and saved to Damaged research.',
    badgeTone: 'error',
  },
]

const conditionKey = (value: string) => value.toLowerCase().replaceAll(' ', '_')
const startingChoice = (current: string): ObservedCondition | null =>
  OPTIONS.find(option => option.value === conditionKey(current))?.value ?? null
const looksLikeIsbn = (code: string) => /^97[89]\d{10}$/.test(code)

type Props = {
  code: string
  lookup: LookupResult | null
  saving: boolean
  error: string
  onSave: (condition: ObservedCondition) => void
  onCancel: () => void
}

/** Pop-up shown after the camera reads a label: identify the copy, then choose its condition. */
export function StocktakeConditionDialog({ code, lookup, saving, error, onSave, onCancel }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<ObservedCondition | null>(null)
  const item = lookup?.found ? lookup.item : null
  // Starts on the recorded condition, so confirming without a change records no change. A lost copy has no starting choice.
  const choice = picked ?? (item ? startingChoice(item.condition) : null)

  useEffect(() => {
    dialog.current?.focus()
  }, [lookup])

  const warnings = lookup?.found
    ? [
        lookup.alreadyCounted && 'This copy was already counted. Saving again still counts it once.',
        !lookup.inScope &&
          `This copy is outside this count's scope (home shelf: ${lookup.item.shelf || 'Not assigned'}). It will be recorded under Outside scope for review.`,
        lookup.item.loan !== 'none' && 'This copy is on loan or in use.',
        lookup.item.lifecycle !== 'Active' &&
          'This copy is archived, so its inventory status will not be changed.',
        conditionKey(lookup.item.condition) === 'lost' &&
          'This copy is recorded as lost. Saving records that it was found. Review its status in Inventory.',
      ].filter((text): text is string => Boolean(text))
    : []

  const needsManualPick = Boolean(item && !choice)

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      onKeyDown={event => {
        if (event.key === 'Escape' && !saving) {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stocktake-condition-title"
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-l)] outline-none"
      >
        {/* Vaadin Lumo Dialog Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[var(--sl-border)] px-6 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b5ea2] dark:text-[#93c5fd]">
                Scanned barcode
              </span>
              <span className="rounded-[4px] bg-[var(--sl-bg-subtle)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--sl-text-header)]">
                {code}
              </span>
              {lookup ? (
                lookup.found ? (
                  lookup.inScope ? (
                    <StatusBadge status="In scope" tone="success" />
                  ) : (
                    <StatusBadge status="Outside scope" tone="warning" />
                  )
                ) : (
                  <StatusBadge status="Not recognized" tone="error" />
                )
              ) : null}
            </div>
            <h2
              id="stocktake-condition-title"
              className="font-display text-lg font-bold leading-snug text-[var(--sl-text-header)]"
            >
              {lookup && !lookup.found ? 'Code not recognized' : 'Check the condition of this book'}
            </h2>
          </div>
          <button
            type="button"
            disabled={saving}
            aria-label="Close dialog"
            onClick={onCancel}
            className="shrink-0 rounded-[6px] p-1.5 text-[var(--sl-text-muted)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)] disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Dialog Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          {!lookup ? (
            <div role="status" className="flex items-center gap-2.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4 text-sm font-medium text-[var(--sl-text-header)]">
              <Loader2 size={16} className="animate-spin text-[#0b5ea2]" aria-hidden="true" />
              <span>Looking up {code}…</span>
            </div>
          ) : null}

          {lookup && !lookup.found ? (
            <div className="space-y-2.5 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#991b1b] dark:border-[rgba(248,113,113,0.35)] dark:bg-[rgba(180,35,24,0.22)] dark:text-[#fca5a5]">
              <p className="font-semibold">
                <strong className="font-mono">{code}</strong> is not in the library list.
              </p>
              {looksLikeIsbn(code) ? (
                <p>
                  This looks like a publisher ISBN. It identifies a title, not one copy. Scan the library copy label instead.
                </p>
              ) : null}
              <p>You can save it for review. Nothing in the inventory will change.</p>
            </div>
          ) : null}

          {item ? (
            <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5 text-sm">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 rounded-[6px] bg-[var(--sl-info-soft)] p-1.5 text-[#0b5ea2] dark:text-[#93c5fd]">
                  <BookOpen size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-[var(--sl-text-header)]">{item.title}</p>
                  <p className="font-mono text-xs text-[var(--sl-text-secondary)]">
                    Accession {item.accession} · Barcode {item.barcode}
                  </p>
                  <p className="text-xs text-[var(--sl-text-secondary)]">
                    Home shelf: <strong className="text-[var(--sl-text-header)]">{item.shelf || 'No shelf recorded'}</strong> · Recorded condition:{' '}
                    <strong className="text-[var(--sl-text-header)]">{item.condition.replaceAll('_', ' ')}</strong>
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="space-y-2">
              {warnings.map(text => (
                <div
                  key={text}
                  className="flex items-start gap-2.5 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] p-3 text-xs font-medium text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.26)] dark:text-[#fcd34d]"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          ) : null}

          {item ? (
            <fieldset disabled={saving} className="space-y-2">
              <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[var(--sl-text-secondary)]">
                What condition is the book in now?
              </legend>
              {OPTIONS.map(option => {
                const selected = choice === option.value
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[8px] border p-3 text-sm transition-colors ${
                      selected
                        ? 'border-[#0b5ea2] bg-[rgba(11,94,162,0.08)] ring-1 ring-[#0b5ea2] dark:border-[#38bdf8] dark:bg-[rgba(56,146,224,0.18)]'
                        : 'border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] hover:bg-[var(--sl-bg-subtle)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="observed-condition"
                      className="mt-1 accent-[#0b5ea2]"
                      checked={selected}
                      onChange={() => setPicked(option.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block font-semibold text-[var(--sl-text-header)]">{option.label}</strong>
                      <span className="text-xs text-[var(--sl-text-secondary)]">{option.hint(item.kind)}</span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ) : null}

          {needsManualPick ? (
            <p className="flex items-center gap-2 rounded-[6px] bg-[var(--sl-warning-soft)] px-3 py-2 text-xs font-medium text-[#92400e] dark:text-[#fcd34d]">
              <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
              Select the copy&rsquo;s current physical condition above to enable Save condition.
            </p>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-[8px] border border-[#b42318] bg-[#b42318] p-3 text-sm font-medium text-white"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        {/* Vaadin Lumo Tinted Dialog Footer */}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-6 py-3">
          <button
            type="button"
            className="inline-flex min-h-[38px] items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--sl-text-header)] transition-colors hover:bg-[var(--sl-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={saving}
            onClick={onCancel}
          >
            Scan another
          </button>
          {item ? (
            <button
              type="button"
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-[6px] bg-[#0b5ea2] px-4 py-2 text-sm font-semibold text-white shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[#094e87] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={saving || !choice}
              onClick={() => choice && onSave(choice)}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Save condition
                </>
              )}
            </button>
          ) : null}
          {/* The API requires a condition. It is ignored for unrecognized codes, which are only listed for review. */}
          {lookup && !lookup.found ? (
            <button
              type="button"
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-[6px] bg-[#0b5ea2] px-4 py-2 text-sm font-semibold text-white shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[#094e87] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={saving}
              onClick={() => onSave('good')}
            >
              {saving ? 'Saving…' : 'Save for review'}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
