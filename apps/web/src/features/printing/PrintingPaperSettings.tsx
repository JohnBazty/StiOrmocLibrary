import { useCallback, useEffect, useState } from 'react'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { PaperSizesDialog } from './PaperSizesDialog'
import { PaperStockDialog } from './PaperStockDialog'
import { printingApi, type PaperStock } from './printing-api'

/**
 * Paper sizes and brand prices, kept in Library setup -> Printing settings.
 * The Print supplies screen (ink and paper stock counts) is archived; print prices still depend on these.
 */
export function PrintingPaperSettings() {
  const [paper, setPaper] = useState<PaperStock[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<'sizes' | 'stock' | null>(null)
  const load = useCallback(async () => {
    try { setPaper((await printingApi.supplies()).paper); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Paper settings could not be loaded.') }
  }, [])
  useEffect(() => { void load() }, [load])
  const saved = async (message: string) => { setNotice(message); await load() }
  return (
    <SectionCard className="max-w-4xl space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Paper sizes and prices</h2>
        <p className="mt-1 text-sm opacity-75">Paper sizes and each brand’s price per page set what photocopy and online printing cost.</p>
      </div>
      {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setNotice(''); setDialog('sizes') }}>Manage paper sizes</Button>
        <Button variant="secondary" disabled={!paper} onClick={() => { setNotice(''); setDialog('stock') }}>Paper stock and prices</Button>
      </div>
      {dialog === 'sizes' ? <PaperSizesDialog onClose={() => setDialog(null)} onSaved={saved} /> : null}
      {dialog === 'stock' && paper ? <PaperStockDialog sizes={paper} onClose={() => setDialog(null)} onSaved={saved} /> : null}
    </SectionCard>
  )
}
