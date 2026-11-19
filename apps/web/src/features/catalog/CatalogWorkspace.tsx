import { BookOpen, FileSpreadsheet, Image } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { confirmLeave } from '../../components/UnsavedChanges'
import { Button } from '../../components/ui'
import { BookCoversPage } from './BookCoversPage'
import { CatalogManagementPage } from './CatalogManagementPage'
import { HoldingsImportPage } from './HoldingsImportPage'

const tools = [
  ['titles', 'Titles', BookOpen],
  ['imports', 'Import books', FileSpreadsheet],
  ['covers', 'Bulk book covers', Image],
] as const

export function CatalogWorkspace() {
  const [params, setParams] = useSearchParams()
  const selected = tools.some(([key]) => key === params.get('tool')) ? params.get('tool') : 'titles'
  return (
    <div className="space-y-5">
      <nav
        aria-label="Catalog tools"
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xs dark:border-slate-700/60 dark:bg-slate-900"
      >
        {tools.map(([key, label, Icon]) => (
          <Button
            key={key}
            variant={selected === key ? 'primary' : 'secondary'}
            onClick={() =>
              confirmLeave(() => {
                const next = new URLSearchParams(params)
                if (key === 'titles') next.delete('tool')
                else next.set('tool', key)
                setParams(next)
              })
            }
          >
            <Icon size={15} />
            {label}
          </Button>
        ))}
      </nav>
      {selected === 'imports' ? <HoldingsImportPage /> : selected === 'covers' ? <BookCoversPage /> : <CatalogManagementPage />}
    </div>
  )
}
