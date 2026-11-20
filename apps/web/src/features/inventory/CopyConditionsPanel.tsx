import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { Button, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { catalogInput } from '../catalog/CatalogDetailsPanel'
import { BASE_CONDITIONS, CopyConditionError, copyConditionsApi, type BaseCondition, type CopyCondition } from './copy-conditions-api'

const BEHAVIOUR_HINT: Record<BaseCondition, string> = {
  Good: 'can be lent',
  Fair: 'can be lent',
  'For Repair': 'held from lending until repaired',
  Damaged: 'held from lending until assessed',
  Lost: 'treated as missing',
}
type Draft = { conditionId: number | null; name: string; behavesAs: BaseCondition; description: string; updatedAt: string }
const emptyDraft: Draft = { conditionId: null, name: '', behavesAs: 'Damaged', description: '', updatedAt: '' }

/**
 * Library setup -> Book conditions. The five base conditions drive lending, returns and stocktake;
 * a library condition (e.g. "Water damage") behaves like one of them.
 */
export function CopyConditionsPanel() {
  const [rows, setRows] = useState<CopyCondition[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirmSave()
  const load = useCallback(async () => {
    try { setRows(await copyConditionsApi.list()); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Book conditions could not be loaded.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(message); await load(); return true }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The change could not be saved.')
      if (cause instanceof CopyConditionError) setErrors(cause.fieldErrors)
      return false
    } finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    const name = draft.name.trim()
    if (name.length < 2 || name.length > 40) { setErrors({ name: 'Enter a condition name of 2 to 40 characters.' }); return }
    setErrors({})
    const input = { name, behavesAs: draft.behavesAs, description: draft.description.trim() }
    const ok = await run(() => draft.conditionId === null ? copyConditionsApi.create(input) : copyConditionsApi.update(draft.conditionId, { ...input, updatedAt: draft.updatedAt }), `${name} saved.`)
    if (ok) setDraft(null)
  }
  const editing = draft?.conditionId ? rows?.find(row => row.conditionId === draft.conditionId) : null

  return (
    <SectionCard className="max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Book conditions</h2>
          <p className="mt-1 max-w-2xl text-sm opacity-75">Add your own conditions, such as “Water damage”. Each one behaves like a base condition, so lending, returns and stocktake know what to do with the copy.</p>
        </div>
        {!draft ? <Button onClick={() => { setErrors({}); setNotice(''); setDraft(emptyDraft) }}>Add condition</Button> : null}
      </div>
      {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}

      {draft ? (
        <form onSubmit={save} aria-label={draft.conditionId ? 'Edit condition' : 'Add condition'} className="grid gap-3 rounded-[8px] border border-[var(--sl-border)] p-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Condition name
            <input className={catalogInput} maxLength={40} disabled={busy || Boolean(editing?.isBase)} value={draft.name} aria-invalid={errors.name ? true : undefined} onChange={event => setDraft({ ...draft, name: event.target.value })} />
            {errors.name ? <span role="alert" className="mt-1 block text-xs text-[#b42318]">{errors.name}</span> : null}
          </label>
          <label className="text-sm font-semibold">Behaves like
            <select className={catalogInput} disabled={busy || Boolean(editing?.isBase) || Boolean(editing && editing.copies > 0)} value={draft.behavesAs} onChange={event => setDraft({ ...draft, behavesAs: event.target.value as BaseCondition })}>
              {BASE_CONDITIONS.filter(value => value !== 'Lost').map(value => <option key={value} value={value}>{value} ({BEHAVIOUR_HINT[value]})</option>)}
            </select>
            {editing && editing.copies > 0 && !editing.isBase ? <span className="mt-1 block text-xs opacity-75">Copies use this condition, so its behaviour stays. Retire it and add a new one instead.</span> : null}
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Description (optional)
            <textarea className={catalogInput} maxLength={300} rows={2} disabled={busy} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save condition'}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { setDraft(null); setErrors({}) }}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {!rows ? (!error ? <p role="status" className="text-sm">Loading book conditions…</p> : null) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--sl-text-secondary)]">
              <tr><th className="py-2 pr-3">Condition</th><th className="py-2 pr-3">Behaves like</th><th className="py-2 pr-3">Copies</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {rows.map(row => (
                <tr key={row.conditionId} className={row.isActive ? '' : 'opacity-65'}>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold">{row.name}</span>
                    {row.description ? <span className="block text-xs opacity-75">{row.description}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3">{row.isBase ? <span className="text-xs font-semibold opacity-75">Base</span> : row.behavesAs}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{row.copies}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={row.isActive ? 'Active' : 'Retired'} /></td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={`Edit ${row.name}`} onClick={() => { setErrors({}); setNotice(''); setDraft({ conditionId: row.conditionId, name: row.name, behavesAs: row.behavesAs, description: row.description ?? '', updatedAt: row.updatedAt }) }}>Edit</Button>
                      {!row.isBase && row.isActive ? <Button size="sm" variant="secondary" disabled={busy} aria-label={`Retire ${row.name}`} onClick={() => ask(`Retire ${row.name}. Copies already in it keep it; it is no longer offered for new changes.`, () => { void run(() => copyConditionsApi.update(row.conditionId, { isActive: false, updatedAt: row.updatedAt }), `${row.name} retired.`) })}>Retire</Button> : null}
                      {!row.isBase && !row.isActive ? <Button size="sm" variant="secondary" disabled={busy} aria-label={`Restore ${row.name}`} onClick={() => void run(() => copyConditionsApi.update(row.conditionId, { isActive: true, updatedAt: row.updatedAt }), `${row.name} restored.`)}>Restore</Button> : null}
                      {!row.isBase && row.copies === 0 ? <Button size="sm" variant="danger" disabled={busy} aria-label={`Delete ${row.name}`} onClick={() => ask(`Delete ${row.name}. No copies use it.`, () => { void run(() => copyConditionsApi.remove(row.conditionId), `${row.name} deleted.`) })}>Delete</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </SectionCard>
  )
}
