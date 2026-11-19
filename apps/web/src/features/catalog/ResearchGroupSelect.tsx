import { useEffect, useState } from 'react'
import { researchGroupsApi, type ResearchGroup } from './research-groups-api'
export function ResearchGroupSelect({ value, onChange, filter = false }: { value: string; onChange: (value: string) => void; filter?: boolean }) {
  const [groups,setGroups] = useState<ResearchGroup[]>([]), [error,setError] = useState('')
  useEffect(() => { let active = true; researchGroupsApi.list().then(rows => { if (active) setGroups(rows) }).catch(() => { if (active) setError('Research groups could not be loaded. Reopen this page to retry.') }); return () => { active = false } }, [])
  return <label className="block min-w-0 text-sm font-semibold">{filter ? 'Program / strand and year' : 'Research group'}
    <select aria-label={filter ? 'Filter research group' : 'Research group'} required={!filter} name="researchGroupId" value={value} onChange={e => onChange(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white">
      <option value="">{filter ? 'All research groups' : 'Select program / strand and year'}</option>
      {groups.filter(group => filter || group.active).map(group => <option key={group.id} value={group.id}>{group.label}{group.active ? '' : ' (Archived)'}</option>)}
    </select>{error && <span role="alert" className="mt-1 block text-xs text-red-700 dark:text-red-300">{error}</span>}
  </label>
}
