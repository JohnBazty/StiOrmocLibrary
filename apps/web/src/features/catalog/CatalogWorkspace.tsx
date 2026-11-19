import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui'
import { confirmLeave } from '../../components/UnsavedChanges'
import { CatalogManagementPage } from './CatalogManagementPage'
import { HoldingsImportPage } from './HoldingsImportPage'
import { FindBookDetailsPage } from './FindBookDetailsPage'
import { BookCoversPage } from './BookCoversPage'

const tools = [['titles', 'Titles'], ['imports', 'Import books'], ['find', 'Enrich a book list'], ['covers', 'Bulk book covers']] as const
export function CatalogWorkspace() {
  const [params, setParams] = useSearchParams()
  const selected = tools.some(([key]) => key === params.get('tool')) ? params.get('tool') : 'titles'
  return <>
    <nav aria-label="Catalog tools" className="mb-5 flex flex-wrap gap-2">{tools.map(([key,label]) => <Button key={key} variant={selected === key ? 'primary' : 'secondary'} onClick={() => confirmLeave(() => { const next = new URLSearchParams(params); if (key === 'titles') next.delete('tool'); else next.set('tool', key); setParams(next) })}>{label}</Button>)}</nav>
    {selected === 'imports' ? <HoldingsImportPage /> : selected === 'find' ? <FindBookDetailsPage /> : selected === 'covers' ? <BookCoversPage /> : <CatalogManagementPage />}
  </>
}
