import { useState } from 'react'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { PaperSizesDialog } from './PaperSizesDialog'

/**
 * Paper sizes, kept in Library setup -> Printing settings.
 * Printing supplies (ink and paper stock) are disregarded/archived.
 */
export function PrintingPaperSettings() {
  const [notice, setNotice] = useState('')
  const [sizesOpen, setSizesOpen] = useState(false)
  const saved = async (message: string) => { setNotice(message) }
  return (
    <SectionCard className="max-w-4xl space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Paper sizes</h2>
        <p className="mt-1 text-sm opacity-75">Manage the paper sizes available for photocopy and online printing.</p>
      </div>
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setNotice(''); setSizesOpen(true) }}>Manage paper sizes</Button>
      </div>
      {sizesOpen ? <PaperSizesDialog onClose={() => setSizesOpen(false)} onSaved={saved} /> : null}
    </SectionCard>
  )
}
