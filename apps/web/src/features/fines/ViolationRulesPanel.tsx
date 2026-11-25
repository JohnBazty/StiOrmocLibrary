import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, FormField, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import {
  describeAllowedLevels,
  describeSharedWarningRule,
  formatFine,
  STUDENT_LEVELS,
  ViolationCategoryError,
  violationCategoriesApi,
  type LevelWarningsMap,
  type StudentLevel,
  type ViolationCategory,
  type ViolationCategoryInput,
  type ViolationSettings,
} from './violation-categories-api'

type Draft = { name: string; description: string; fineAmount: string; allLevels: boolean; allowedLevels: StudentLevel[] }
type Errors = Partial<Record<'name' | 'description' | 'fineAmount' | 'allowedLevels', string>>

const emptyDraft: Draft = { name: '', description: '', fineAmount: '', allLevels: true, allowedLevels: [...STUDENT_LEVELS] }
const NAME_ERROR = 'Enter a category name of 2 to 80 characters.'
const HARD_MAX_FINE = 999999.99
const DEFAULT_MAX_FINE = 9999.99
const amountError = (max: number) => `Enter a peso amount above 0 and up to ${formatFine(max)}, with at most 2 decimals.`
const validAmount = (text: string, max: number) => /^\d{1,6}(\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= max

const fromCategory = (category: ViolationCategory): Draft => {
  const levels = category.allowedLevels?.length ? category.allowedLevels : [...STUDENT_LEVELS]
  return {
    name: category.name,
    description: category.description ?? '',
    fineAmount: category.fineAmount.toFixed(2),
    allLevels: levels.length === STUDENT_LEVELS.length,
    allowedLevels: [...levels],
  }
}

function validate(draft: Draft, maxFine: number): Errors {
  const errors: Errors = {}
  const name = draft.name.trim()
  if (name.length < 2 || name.length > 80) errors.name = NAME_ERROR
  if (draft.description.trim().length > 300) errors.description = 'Keep the description to 300 characters or less.'
  if (!validAmount(draft.fineAmount.trim(), maxFine)) errors.fineAmount = amountError(maxFine)
  if (!draft.allLevels && draft.allowedLevels.length === 0) errors.allowedLevels = 'Choose at least one year or grade level.'
  return errors
}

const sameLevels = (a: StudentLevel[], b: StudentLevel[]) => a.length === b.length && a.every((item, index) => item === b[index])

export function ViolationRulesPanel() {
  const [items, setItems] = useState<ViolationCategory[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<ViolationCategory | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [settings, setSettings] = useState<ViolationSettings>({ maxFine: DEFAULT_MAX_FINE, warningsBeforeFine: 2, levelWarnings: {}, updatedAt: '' })
  const [limitOpen, setLimitOpen] = useState(false)
  const [limitDraft, setLimitDraft] = useState('')
  const [limitError, setLimitError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [defaultWarningsDraft, setDefaultWarningsDraft] = useState('2')
  const [customByLevel, setCustomByLevel] = useState(false)
  const [levelDraft, setLevelDraft] = useState<Record<StudentLevel, string>>({
    'Grade 11': '2', 'Grade 12': '2', '1st Year': '2', '2nd Year': '2', '3rd Year': '2', '4th Year': '2',
  })
  const [rulesError, setRulesError] = useState('')

  const load = useCallback(async () => {
    try {
      const [list, loadedSettings] = await Promise.all([violationCategoriesApi.list(), violationCategoriesApi.getSettings()])
      setItems(list)
      setSettings({
        maxFine: typeof loadedSettings?.maxFine === 'number' ? loadedSettings.maxFine : DEFAULT_MAX_FINE,
        warningsBeforeFine: typeof loadedSettings?.warningsBeforeFine === 'number' ? loadedSettings.warningsBeforeFine : 2,
        levelWarnings: loadedSettings?.levelWarnings && typeof loadedSettings.levelWarnings === 'object' ? loadedSettings.levelWarnings : {},
        updatedAt: loadedSettings?.updatedAt ?? '',
      })
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Violation rules are unavailable.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  function open(target: ViolationCategory | 'new') {
    setEditing(target)
    setDraft(target === 'new' ? emptyDraft : fromCategory(target))
    setErrors({})
    setFormError('')
    setConfirmingDelete(false)
  }
  const close = () => { if (!busy) setEditing(null) }

  function openWarningRules() {
    const base = String(settings.warningsBeforeFine)
    const hasCustom = STUDENT_LEVELS.some(level => typeof settings.levelWarnings[level] === 'number' && settings.levelWarnings[level] !== settings.warningsBeforeFine)
    setDefaultWarningsDraft(base)
    setCustomByLevel(hasCustom)
    const map = {} as Record<StudentLevel, string>
    for (const level of STUDENT_LEVELS) {
      map[level] = String(settings.levelWarnings[level] ?? settings.warningsBeforeFine)
    }
    setLevelDraft(map)
    setRulesError('')
    setRulesOpen(true)
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setFormError('')
    try {
      await action()
      setEditing(null)
      setNotice(done)
      await load()
    } catch (cause) {
      if (cause instanceof ViolationCategoryError && Object.keys(cause.fieldErrors).length) setErrors(cause.fieldErrors as Errors)
      setFormError(cause instanceof Error ? cause.message : 'The category could not be saved.')
      void load() // a change by someone else shows up in the table behind the dialog
    } finally {
      setBusy(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!editing || busy) return
    const found = validate(draft, settings.maxFine)
    setErrors(found)
    if (Object.keys(found).length) return
    const selectedLevels = draft.allLevels ? [...STUDENT_LEVELS] : STUDENT_LEVELS.filter(level => draft.allowedLevels.includes(level))
    const input: ViolationCategoryInput = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      fineAmount: draft.fineAmount.trim(),
      allowedLevels: selectedLevels,
    }
    if (editing === 'new') return void run(() => violationCategoriesApi.create(input), `${input.name} added.`)
    const before = fromCategory(editing)
    const changed: Partial<ViolationCategoryInput> = {}
    if (!editing.used && input.name !== before.name) changed.name = input.name
    if (input.description !== before.description) changed.description = input.description
    if (input.fineAmount !== before.fineAmount) changed.fineAmount = input.fineAmount
    if (!sameLevels(selectedLevels, before.allowedLevels)) changed.allowedLevels = selectedLevels
    if (!Object.keys(changed).length) return setEditing(null)
    void run(() => violationCategoriesApi.update(editing.categoryId, { ...changed, updatedAt: editing.updatedAt }), `${editing.name} saved. New violations use the new rule; fines already issued keep their amount.`)
  }

  async function saveLimit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const text = limitDraft.trim()
    if (!validAmount(text, HARD_MAX_FINE)) return setLimitError(amountError(HARD_MAX_FINE))
    setBusy(true)
    setLimitError('')
    try {
      const saved = await violationCategoriesApi.saveSettings({ maxFine: text, updatedAt: settings.updatedAt })
      setSettings(saved)
      setLimitOpen(false)
      setNotice(`Highest fine is now PHP ${formatFine(saved.maxFine)}.`)
    } catch (cause) {
      setLimitError(cause instanceof Error ? cause.message : 'The limit could not be saved.')
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function saveWarningRules(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const parseWarnings = (raw: string) => (/^\d{1,2}$/.test(raw.trim()) ? Number(raw.trim()) : NaN)
    const defaultCount = parseWarnings(defaultWarningsDraft)
    if (!Number.isInteger(defaultCount) || defaultCount < 0 || defaultCount > 99) {
      return setRulesError('Enter a whole number from 0 to 99 for default warnings before fine.')
    }
    const nextLevelWarnings: LevelWarningsMap = {}
    if (customByLevel) {
      for (const level of STUDENT_LEVELS) {
        const count = parseWarnings(levelDraft[level])
        if (!Number.isInteger(count) || count < 0 || count > 99) {
          return setRulesError(`Enter a whole number from 0 to 99 for ${level}.`)
        }
        if (count !== defaultCount) nextLevelWarnings[level] = count
      }
    }
    setBusy(true)
    setRulesError('')
    try {
      const saved = await violationCategoriesApi.saveSettings({
        warningsBeforeFine: defaultCount,
        levelWarnings: nextLevelWarnings,
        updatedAt: settings.updatedAt,
      })
      setSettings(saved)
      setRulesOpen(false)
      setNotice('Shared violation warning rules saved. New violations follow the updated limits.')
    } catch (cause) {
      setRulesError(cause instanceof Error ? cause.message : 'The warning rules could not be saved.')
      void load()
    } finally {
      setBusy(false)
    }
  }

  const set = (key: 'name' | 'description' | 'fineAmount') => (event: { target: { value: string } }) => {
    setDraft(value => ({ ...value, [key]: event.target.value }))
    if (errors[key]) setErrors(value => ({ ...value, [key]: undefined }))
  }

  function toggleCategoryLevel(level: StudentLevel) {
    setDraft(value => {
      const exists = value.allowedLevels.includes(level)
      const next = exists ? value.allowedLevels.filter(item => item !== level) : STUDENT_LEVELS.filter(item => item === level || value.allowedLevels.includes(item))
      return { ...value, allowedLevels: next }
    })
    if (errors.allowedLevels) setErrors(value => ({ ...value, allowedLevels: undefined }))
  }

  const existing = editing && editing !== 'new' ? editing : null

  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Violation rules</h2>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
            Every violation adds to one shared offense count across all categories. Changes apply to new violations only.
          </p>
        </div>
        <Button onClick={() => open('new')}>
          <Plus size={16} aria-hidden="true" /> Add category
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--sl-text-header)]">Shared warnings before fine</p>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{describeSharedWarningRule(settings)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={openWarningRules}>Change warning rules</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/60 px-5 py-2.5 text-sm">
        <span className="font-semibold text-[var(--sl-text-header)]">Highest fine allowed: PHP {formatFine(settings.maxFine)}</span>
        <Button size="sm" variant="secondary" onClick={() => { setLimitDraft(String(settings.maxFine)); setLimitError(''); setLimitOpen(true) }}>Change limit</Button>
      </div>
      <div className="p-5">
        {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
        {error ? (
          <NoticeBanner tone="error" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Try again</Button>}>
            {error}
          </NoticeBanner>
        ) : null}
        {!items && !error ? <p role="status" className="text-sm text-[var(--sl-text-secondary)]">Loading violation rules…</p> : null}
        {items ? (
          <ResponsiveTable label="Violation categories">
            <table aria-label="Violation categories" className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  {['Category', 'Applies to', 'Fine amount', 'Status', ''].map((heading, index) => (
                    <th key={index} scope="col" className="px-3 py-2.5">{heading || <span className="sr-only">Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {items.map(category => (
                  <tr key={category.categoryId} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-[var(--sl-text-header)]">{category.name}</p>
                      {category.description ? <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{category.description}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--sl-text-secondary)]">{describeAllowedLevels(category.allowedLevels)}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums">PHP {category.fineAmount.toFixed(2)}</td>
                    <td className="px-3 py-3"><StatusBadge status={category.isActive ? 'Active' : 'Retired'} tone={category.isActive ? 'success' : 'neutral'} /></td>
                    <td className="px-3 py-3">
                      <Button size="sm" variant="secondary" aria-label={`Edit ${category.name}`} onClick={() => open(category)}>
                        <Pencil size={14} aria-hidden="true" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : null}
      </div>

      {editing ? (
        <LumoDialog title={confirmingDelete ? 'Delete this category?' : existing ? 'Edit violation category' : 'Add violation category'} busy={busy} onClose={close}
          description={confirmingDelete ? undefined : 'The fine amount applies once a student uses up their shared warnings across all violations.'}>
          {confirmingDelete && existing ? (
            <div className="space-y-3">
              {formError ? <NoticeBanner tone="error">{formError}</NoticeBanner> : null}
              <p className="text-sm text-[var(--sl-text)]">
                <strong>{existing.name}</strong> will be removed from Library setup and from the Fines filters. It has no violation records, so no history is lost. This cannot be undone.
              </p>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => { setConfirmingDelete(false); setFormError('') }}>Keep category</Button>
                <Button type="button" variant="danger" disabled={busy}
                  onClick={() => void run(() => violationCategoriesApi.remove(existing.categoryId), `${existing.name} deleted.`)}>
                  {busy ? 'Deleting…' : `Delete ${existing.name}`}
                </Button>
              </div>
            </div>
          ) : (
          <form onSubmit={save} noValidate className="space-y-3">
            {formError && !Object.keys(errors).some(key => errors[key as keyof Errors]) ? <NoticeBanner tone="error">{formError}</NoticeBanner> : null}
            <FormField id="vc-name" label="Category name" required error={errors.name}
              helperText={existing?.used ? 'The name cannot change because violation records already use it.' : undefined}>
              <input id="vc-name" className="sl-input" value={draft.name} onChange={set('name')} maxLength={80}
                disabled={Boolean(existing?.used)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'vc-name-error' : undefined} />
            </FormField>
            <FormField id="vc-description" label="Short description (optional)" error={errors.description}>
              <textarea id="vc-description" className="sl-input h-20 py-2.5" value={draft.description} onChange={set('description')} maxLength={300} />
            </FormField>
            <FormField id="vc-amount" label="Fine amount (PHP)" required error={errors.fineAmount} helperText={`Up to PHP ${formatFine(settings.maxFine)}`}>
              <input id="vc-amount" className="sl-input" inputMode="decimal" value={draft.fineAmount} onChange={set('fineAmount')} maxLength={7}
                aria-invalid={Boolean(errors.fineAmount)} aria-describedby={errors.fineAmount ? 'vc-amount-error' : undefined} />
            </FormField>
            <fieldset className="space-y-2 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3">
              <legend className="px-1 text-xs font-semibold text-[var(--sl-text-header)]">Applies to year &amp; grade levels</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.allLevels} onChange={event => {
                  const all = event.target.checked
                  setDraft(value => ({ ...value, allLevels: all, allowedLevels: all ? [...STUDENT_LEVELS] : value.allowedLevels }))
                  if (errors.allowedLevels) setErrors(value => ({ ...value, allowedLevels: undefined }))
                }} />
                All year &amp; grade levels
              </label>
              {!draft.allLevels ? (
                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                  {STUDENT_LEVELS.map(level => (
                    <label key={level} className="flex items-center gap-2 text-xs text-[var(--sl-text)]">
                      <input type="checkbox" checked={draft.allowedLevels.includes(level)} onChange={() => toggleCategoryLevel(level)} />
                      {level}
                    </label>
                  ))}
                </div>
              ) : null}
              {errors.allowedLevels ? <p role="alert" className="text-xs font-medium text-[var(--sl-error-text)]">{errors.allowedLevels}</p> : null}
            </fieldset>
            {existing?.used ? (
              <p className="text-xs text-[var(--sl-text-secondary)]">{existing.name} has violation records, so it cannot be deleted. Retire it instead.</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {existing ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy}
                    onClick={() => void run(() => violationCategoriesApi.update(existing.categoryId, { isActive: !existing.isActive, updatedAt: existing.updatedAt }),
                      existing.isActive ? `${existing.name} retired. Old records keep it.` : `${existing.name} restored.`)}>
                    {existing.isActive ? 'Retire category' : 'Restore category'}
                  </Button>
                  <Button type="button" variant="danger" disabled={busy || existing.used}
                    onClick={() => { setFormError(''); setConfirmingDelete(true) }}>
                    <Trash2 size={14} aria-hidden="true" /> Delete category
                  </Button>
                </div>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save category'}</Button>
              </div>
            </div>
          </form>
          )}
        </LumoDialog>
      ) : null}

      {rulesOpen ? (
        <LumoDialog title="Shared warning rules" busy={busy} onClose={() => { if (!busy) setRulesOpen(false) }}
          description="Warnings are counted across all violation categories combined. Set one limit for everyone or customize by year and grade level.">
          <form onSubmit={saveWarningRules} noValidate className="space-y-4">
            {rulesError ? <NoticeBanner tone="error">{rulesError}</NoticeBanner> : null}
            <FormField id="vc-default-warnings" label="Default warnings before fine" helperText="Enter any whole number from 0 to 99. 0 means the 1st violation is already a fine.">
              <input id="vc-default-warnings" type="number" min={0} max={99} step={1} inputMode="numeric" className="sl-input"
                value={defaultWarningsDraft} onChange={event => { setDefaultWarningsDraft(event.target.value); setRulesError('') }} />
            </FormField>
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--sl-text-header)]">
              <input type="checkbox" checked={customByLevel} onChange={event => setCustomByLevel(event.target.checked)} />
              Customize by year / grade level
            </label>
            {customByLevel ? (
              <div className="grid gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 sm:grid-cols-2">
                {STUDENT_LEVELS.map(level => (
                  <FormField key={level} id={`vc-level-${level.replace(/\s+/g, '-').toLowerCase()}`} label={level}>
                    <input id={`vc-level-${level.replace(/\s+/g, '-').toLowerCase()}`} type="number" min={0} max={99} step={1} inputMode="numeric"
                      className="sl-input" value={levelDraft[level]}
                      onChange={event => { setLevelDraft(value => ({ ...value, [level]: event.target.value })); setRulesError('') }} />
                  </FormField>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setRulesOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save warning rules'}</Button>
            </div>
          </form>
        </LumoDialog>
      ) : null}

      {limitOpen ? (
        <LumoDialog title="Highest fine allowed" busy={busy} onClose={() => { if (!busy) setLimitOpen(false) }}
          description="No violation category can have a fine above this. Fines already issued are not changed.">
          <form onSubmit={saveLimit} noValidate className="space-y-3">
            <FormField id="vc-limit" label="Highest fine (PHP)" required error={limitError}>
              <input id="vc-limit" className="sl-input" inputMode="decimal" value={limitDraft} maxLength={9}
                onChange={event => { setLimitDraft(event.target.value); setLimitError('') }}
                aria-invalid={Boolean(limitError)} aria-describedby={limitError ? 'vc-limit-error' : undefined} />
            </FormField>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setLimitOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save limit'}</Button>
            </div>
          </form>
        </LumoDialog>
      ) : null}
    </SectionCard>
  )
}
