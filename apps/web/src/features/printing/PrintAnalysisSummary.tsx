import type { PageFinding, PrintBill } from './printing-api'

const money=(cents:number)=>`₱${(cents/100).toFixed(2)}`
export function PrintAnalysisSummary({pages,bill,review=false}:{pages?:PageFinding[];bill?:PrintBill;review?:boolean}) {
  if(!bill)return null
  const numbers=(key:'hasImage'|'hasColor'|'hasGraphics')=>pages?.filter(page=>page[key]).map(page=>page.page).join(', ')||'None'
  return <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/15">
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 tabular-nums">
      <dt>Monochrome pages</dt><dd>{bill.monoPages} × {money(bill.monoRate)} × {bill.copies}</dd>
      <dt>Colored pages</dt><dd>{bill.colorPages} × {money(bill.colorRate)} × {bill.copies}</dd>
      <dt>Page subtotal</dt><dd>{money(bill.baseCentavos)}</dd>
      <dt>Image-page additions</dt><dd>{money(bill.imageCentavos)}</dd>
      <dt className="border-t pt-2 font-bold">{review?'Estimated total':'Total'}</dt><dd className="border-t pt-2 font-bold">{money(bill.totalCentavos)}</dd>
    </dl>
    <details className="pt-2"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Page details</summary><p className="break-words">Images detected on pages: {numbers('hasImage')}</p><p className="mt-1 break-words">Color detected on pages: {numbers('hasColor')}</p><p className="mt-1 break-words">Possible graphics on pages: {numbers('hasGraphics')}</p><p className="mt-2 text-xs opacity-75">Images can include scanned text and logos. Staff reviews uncertain pages before adding image charges.</p></details>
    {review&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-950">Staff will verify the pages. You’ll review and accept the final price before paying.</p>}
  </div>
}
