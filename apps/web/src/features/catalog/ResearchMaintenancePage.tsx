import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { CatalogManagementPage } from './CatalogManagementPage'
import { ThesisInventorySection } from '../inventory/ThesisInventorySection'
import { ResearchImportDialog } from './ResearchImportDialog'

export function ResearchMaintenancePage() {
  const [importing, setImporting] = useState(false)
  // Bumped after an import so the title list and the bound copies load again.
  const [loaded, setLoaded] = useState(0)
  const importButton = <button onClick={() => setImporting(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399] bg-white px-4 text-sm font-bold text-[#003399]"><FileSpreadsheet size={16} /> Import from Excel/CSV</button>
  return <>
    <CatalogManagementPage key={`titles-${loaded}`} kind="research" maintenance actions={importButton} />
    <h2 className="mb-3 mt-8 text-xl font-black text-[#003399] dark:text-white">Bound copies</h2>
    <ThesisInventorySection key={`copies-${loaded}`} />
    {importing ? <ResearchImportDialog onClose={() => setImporting(false)} onImported={() => setLoaded((value) => value + 1)} /> : null}
  </>
}
