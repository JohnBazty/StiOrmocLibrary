import { Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, FormField, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import {
  describeCategory,
  ViolationCategoryError,
  violationCategoriesApi,
  type ViolationCategory,
  type ViolationCategoryInput,
} from './violation-categories-api'

type Draft = { name: string; description: string; warningsBeforeFine: string; fineAmount: string }
type Errors = Partial<Record<keyof Draft, string>>

const emptyDraft: Draft = { name: '', description: '', warningsBeforeFine: '2', fineAmount: '' }
const NAME_ERROR = 'Enter a category name of 2 to 80 characters.'
const AMOUNT_ERROR = 'Enter a peso amount above 0 with at most 2 decimals.'

const fromCategory = (category: ViolationCategory): Draft => ({
  name: category.name,
  description: category.description ?? '',
  warningsBeforeFine: String(category.warningsBeforeFine),
  fineAmount: category.fineAmount.toFixed(2),
})

function validate(draft: Draft): Errors {
  const errors: Errors = {}
  const name = draft.name.trim()
  if (name.length < 2 || name.length > 80) errors.name = NAME_ERROR
  if (draft.description.trim().length > 300) errors.description = 'Keep the description to 300 characters or less.'
  const amount = draft.fineAmount.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) errors.fineAmount = AMOUNT_ERROR
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

  const load = useCallback(async () => {
    try {
      setItems(await violationCategoriesApi.list())
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
    const found = validate(draft)
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
        <LumoDialog title={existing ? 'Edit violation category' : 'Add violation category'} busy={busy} onClose={close}
          description="Faculty go straight to the fine. Students get the warnings first.">
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
              <FormField id="vc-amount" label="Fine amount (PHP)" required error={errors.fineAmount}>
                <input id="vc-amount" className="sl-input" inputMode="decimal" value={draft.fineAmount} onChange={set('fineAmount')}
                  aria-invalid={Boolean(errors.fineAmount)} aria-describedby={errors.fineAmount ? 'vc-amount-error' : undefined} />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {existing ? (
                <Button type="button" variant="secondary" disabled={busy}
                  onClick={() => void run(() => violationCategoriesApi.update(existing.categoryId, { isActive: !existing.isActive, updatedAt: existing.updatedAt }),
                    existing.isActive ? `${existing.name} retired. Old records keep it.` : `${existing.name} restored.`)}>
                  {existing.isActive ? 'Retire category' : 'Restore category'}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save category'}</Button>
              </div>
            </div>
          </form>
        </LumoDialog>
      ) : null}
    </SectionCard>
  )
}
