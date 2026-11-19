import { Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { describeDdcCode, generateDdcAndCutter, type GeneratedDdcCutter } from './ddc-cutter'
import { deweyApi, type DeweyResult, type DeweySelection } from './dewey-api'
import { isbnInputError, normalizeIsbnInput } from './isbn'

export function DeweyField({
  isbn,
  value,
  onChange,
  disabled = false,
  title = '',
  author = '',
  categoryName = '',
  onGenerateCallNumber,
}: {
  isbn: string
  value: DeweySelection | null
  onChange: (value: DeweySelection | null) => void
  disabled?: boolean
  title?: string
  author?: string
  categoryName?: string
  onGenerateCallNumber?: (generated: GeneratedDdcCutter) => void
}) {
  const id = useId()
  const normalized = normalizeIsbnInput(isbn)
  const [result, setResult] = useState<DeweyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [generated, setGenerated] = useState<GeneratedDdcCutter | null>(null)
  const latest = useRef({ value, onChange })
  const previousIsbn = useRef(normalized)
  const edited = useRef(false)
  latest.current = { value, onChange }

  useEffect(() => {
    if (previousIsbn.current !== normalized) {
      previousIsbn.current = normalized
      edited.current = false
      latest.current.onChange(null)
    }
    setResult(null)
    if (!normalized || isbnInputError(normalized)) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      void deweyApi
        .lookup(normalized, controller.signal)
        .then(found => {
          if (controller.signal.aborted) return
          setResult(found)
          if (!edited.current && !latest.current.value?.code && found.status === 'matched') {
            latest.current.onChange({
              code: found.candidates[0].code,
              source: 'open_library',
              reviewed: false,
            })
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResult({ isbn: normalized, status: 'unavailable', candidates: [] })
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalized, retry])

  const valid = !value?.code || (/^\d{3}(\.\d+)?$/.test(value.code) && value.code.length <= 64)
  const identifiedSubject = value?.code && valid ? describeDdcCode(value.code) : null

  function handleGenerate() {
    const candidateCode =
      value?.code && valid
        ? value.code
        : result?.status === 'matched' && result.candidates[0]?.code
          ? result.candidates[0].code
          : ''
    const next = generateDdcAndCutter({
      title,
      author,
      categoryName,
      deweyCode: candidateCode,
    })
    edited.current = true
    setGenerated(next)
    onChange({
      code: next.ddcCode,
      source: value?.source === 'open_library' && candidateCode === value.code ? 'open_library' : 'manual',
      reviewed: value?.reviewed ?? false,
    })
    onGenerateCallNumber?.(next)
  }

  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4 text-[var(--sl-text)]"
    >
      <legend className="px-1 text-sm font-semibold text-[var(--sl-text-header)]">
        Dewey classification (optional)
      </legend>
      <p className="text-xs text-[var(--sl-text-secondary)]">
        The Dewey number groups books by subject. Review it before saving; use Generate DDC &amp; Cutter to identify the classification and auto-fill the DDC + Cutter Table call number.
      </p>
      <p role="status" className="text-xs font-medium text-[var(--sl-text-header)]">
        {loading
          ? 'Finding a Dewey number…'
          : result?.status === 'matched'
            ? 'Suggestion found from Open Library.'
            : result?.status === 'multiple'
              ? 'Open Library lists several numbers. Choose the correct one.'
              : result?.status === 'unavailable'
                ? 'Lookup is unavailable. Try again or enter a number manually.'
                : result?.status === 'not_found'
                  ? 'No Dewey number found. Enter one manually or leave it unassigned.'
                  : 'Enter a valid ISBN for automatic lookup, or enter a number manually.'}
      </p>

      {result?.status === 'multiple' ? (
        <label className="block text-xs font-semibold text-[var(--sl-text-secondary)]" htmlFor={`${id}-choices`}>
          Choose a Dewey suggestion
          <select
            id={`${id}-choices`}
            className="sl-input mt-1"
            value={value?.source === 'open_library' ? value.code : ''}
            onChange={event => {
              edited.current = true
              onChange(
                event.target.value
                  ? { code: event.target.value, source: 'open_library', reviewed: false }
                  : null,
              )
            }}
          >
            <option value="">Choose a number</option>
            {result.candidates.map(candidate => (
              <option key={candidate.code}>{candidate.code}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-xs font-semibold text-[var(--sl-text-secondary)]" htmlFor={`${id}-code`}>
          Dewey number
          <input
            id={`${id}-code`}
            className="sl-input mt-1"
            maxLength={64}
            placeholder="e.g. 428 or 005.133"
            value={value?.code ?? ''}
            aria-invalid={!valid}
            aria-describedby={!valid ? `${id}-error` : undefined}
            onChange={event => {
              edited.current = true
              onChange(
                event.target.value
                  ? { code: event.target.value, source: 'manual', reviewed: false }
                  : null,
              )
            }}
          />
        </label>
        <Button type="button" variant="secondary" onClick={handleGenerate}>
          <Sparkles size={15} aria-hidden="true" /> Generate DDC &amp; Cutter
        </Button>
      </div>

      {!valid ? (
        <p id={`${id}-error`} role="alert" className="field-error">
          Use three digits and an optional decimal, such as 005.1.
        </p>
      ) : null}

      {identifiedSubject ? (
        <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[var(--sl-text-header)]">
              Classification: <span className="font-mono text-[#0b5ea2] dark:text-[#93c5fd]">{value?.code}</span> — {identifiedSubject}
            </span>
            <span className="text-[var(--sl-text-muted)]">
              Source: {value?.source === 'open_library' ? 'Open Library ISBN record' : 'Entered manually'}
            </span>
          </div>
          {generated && generated.ddcCode === value?.code ? (
            <dl className="mt-2 grid gap-2 border-t border-[var(--sl-border)] pt-2 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                  DDC column
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-bold text-[var(--sl-text-header)]">
                  {generated.ddcCode}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                  Cutter ({generated.heading})
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-bold text-[var(--sl-text-header)]">
                  {generated.cutter}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                  DDC + Cutter Table
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-bold text-[#0b5ea2] dark:text-[#93c5fd]">
                  {generated.callNumber}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {value?.code ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--sl-text-header)]">
            <input
              type="checkbox"
              checked={value.reviewed}
              disabled={!valid}
              onChange={event => onChange({ ...value, reviewed: event.target.checked })}
            />
            I reviewed this Dewey number
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              edited.current = true
              setGenerated(null)
              onChange(null)
            }}
          >
            Leave Dewey unassigned
          </Button>
        </div>
      ) : null}

      {result?.status === 'unavailable' ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setRetry(current => current + 1)}>
          Try Dewey lookup again
        </Button>
      ) : null}
    </fieldset>
  )
}
