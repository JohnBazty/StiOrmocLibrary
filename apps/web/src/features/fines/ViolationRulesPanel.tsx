import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, FormField, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import {
  describeCategory,
  formatFine,
  ViolationCategoryError,
  violationCategoriesApi,
  type ViolationCategory,
  type ViolationCategoryInput,
  type ViolationSettings,
} from './violation-categories-api'

type Draft = { name: string; description: string; warningsBeforeFine: string; fineAmount: string }
type Errors = Partial<Record<keyof Draft, string>>

const emptyDraft: Draft = { name: '', description: '', warningsBeforeFine: '2', fineAmount: '' }
const NAME_ERROR = 'Enter a category name of 2 to 80 characters.'
const HARD_MAX_FINE = 999999.99
const DEFAULT_MAX_FINE = 9999.99
const amountError = (max: number) => `Enter a peso amount above 0 and up to ${formatFine(max)}, with at most 2 decimals.`
const validAmount = (text: string, max: number) => /^\d{1,6}(\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= max

const fromCategory = (category: ViolationCategory): Draft => ({
  name: category.name,
  description: category.description ?? '',
  warningsBeforeFine: String(category.warningsBeforeFine),
  fineAmount: category.fineAmount.toFixed(2),
})

function validate(draft: Draft, maxFine: number): Errors {
  const errors: Errors = {}
  const name = draft.name.trim()
  if (name.length < 2 || name.length > 80) errors.name = NAME_ERROR
  if (draft.description.trim().length > 300) errors.description = 'Keep the description to 300 characters or less.'
  if (!validAmount(draft.fineAmount.trim(), maxFine)) errors.fineAmount = amountError(maxFine)
  return errors
}

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
  const [settings, setSettings] = useState<ViolationSettings>({ maxFine: DEFAULT_MAX_FINE, updatedAt: '' })
  const [limitOpen, setLimitOpen] = useState(false)
  const [limitDraft, setLimitDraft] = useState('')
  const [limitError, setLimitError] = useState('')

  const load = useCallback(async () => {
    try {
      const [list, limit] = await Promise.all([violationCategoriesApi.list(), violationCategoriesApi.getSettings()])
      setItems(list)
      setSettings(limit)
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
    const input: ViolationCategoryInput = {
      name: draft.name.trim(), description: draft.description.trim(),
      warningsBeforeFine: Number(draft.warningsBeforeFine), fineAmount: draft.fineAmount.trim(),
    }
    if (editing === 'new') return void run(() => violationCategoriesApi.create(input), `${input.name} added.`)
    const before = fromCategory(editing)
    const changed: Partial<ViolationCategoryInput> = {}
    if (!editing.used && input.name !== before.name) changed.name = input.name
    if (input.description !== before.description) changed.description = input.description
    if (draft.warningsBeforeFine !== before.warningsBeforeFine) changed.warningsBeforeFine = input.warningsBeforeFine
    if (input.fineAmount !== before.fineAmount) changed.fineAmount = input.fineAmount
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

  const set = (key: keyof Draft) => (event: { target: { value: string } }) => {
    setDraft(value => ({ ...value, [key]: event.target.value }))
    if (errors[key]) setErrors(value => ({ ...value, [key]: undefined }))
  }
  const existing = editing && editing !== 'new' ? editing : null

  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Violation rules</h2>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
            Warnings and fines on Fines → Violations follow these rules. Changes apply to new violations only.
          </p>
        </div>
        <Button onClick={() => open('new')}>
          <Plus size={16} aria-hidden="true" /> Add category
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-2.5 text-sm">
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
                  {['Category', 'Warnings before fine', 'Fine on next offense', 'Status', ''].map((heading, index) => (
                    <th key={index} scope="col" className="px-3 py-2.5">{heading || <span className="sr-only">Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {items.map(category => (
                  <tr key={category.categoryId} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-[var(--sl-text-header)]">{category.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{describeCategory(category)}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{category.warningsBeforeFine}</td>
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
          description={confirmingDelete ? undefined : 'Faculty go straight to the fine. Students get the warnings first.'}>
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
            {formError && !Object.keys(errors).some(key => errors[key as keyof Draft]) ? <NoticeBanner tone="error">{formError}</NoticeBanner> : null}
            <FormField id="vc-name" label="Category name" required error={errors.name}
              helperText={existing?.used ? 'The name cannot change because violation records already use it.' : undefined}>
              <input id="vc-name" className="sl-input" value={draft.name} onChange={set('name')} maxLength={80}
                disabled={Boolean(existing?.used)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'vc-name-error' : undefined} />
            </FormField>
            <FormField id="vc-description" label="Short description (optional)" error={errors.description}>
              <textarea id="vc-description" className="sl-input h-20 py-2.5" value={draft.description} onChange={set('description')} maxLength={300} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="vc-warnings" label="Warnings before the fine" helperText="0 means the first offense is already a fine.">
                <select id="vc-warnings" className="sl-input" value={draft.warningsBeforeFine} onChange={set('warningsBeforeFine')}>
                  {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </FormField>
              <FormField id="vc-amount" label="Fine amount (PHP)" required error={errors.fineAmount} helperText={`Up to PHP ${formatFine(settings.maxFine)}`}>
                <input id="vc-amount" className="sl-input" inputMode="decimal" value={draft.fineAmount} onChange={set('fineAmount')} maxLength={7}
                  aria-invalid={Boolean(errors.fineAmount)} aria-describedby={errors.fineAmount ? 'vc-amount-error' : undefined} />
              </FormField>
            </div>
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
