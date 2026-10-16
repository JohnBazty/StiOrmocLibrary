import { lazy, Suspense, useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import type { OfficePreview } from './file-preview-reader'
const PdfFilePreview = lazy(() => import('./PdfFilePreview').catch(() => ({
  default: () => <p role="status" className="text-sm">PDF preview is unavailable in this browser. Open the original PDF below to check it.</p>,
})))

type Props = { file: File | null; onRemove: () => void; disabled?: boolean; removeLabel?: string; display?: 'content' | 'icon' }
function sizeLabel(bytes: number) { return bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
const cardClass = 'min-w-0 space-y-3 rounded-2xl border border-[#003399]/20 bg-[#003399]/5 p-3 text-left text-[#003399] dark:border-white/20 dark:bg-white/5 dark:text-white'

function FileSelectionHeader({ file, onRemove, disabled = false, removeLabel = 'Remove selected file', display }: Props & { file: File }) {
  const format = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? 'PDF' : /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'DOCX' : 'FILE'
  return <div className="flex min-w-0 items-start gap-3">
    {display === 'icon' ? <span role="img" aria-label={`${format} file`} className="flex h-14 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#003399]/15 bg-white dark:border-white/20 dark:bg-[#001a4d]"><FileText aria-hidden size={26} /><span className="rounded bg-[#003399] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{format}</span></span> : <FileText aria-hidden size={20} className="mt-1 shrink-0" />}
    <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase">Selected file</p><p className="break-all text-sm font-semibold">{file.name}</p><p className="text-xs opacity-70">{sizeLabel(file.size)}</p></div>
    <button type="button" aria-label={removeLabel} disabled={disabled} onClick={onRemove} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-current/20 hover:bg-white/60 disabled:opacity-40"><X aria-hidden size={18} /></button>
  </div>
}

/** Mount per file so a replacement can never display the previous file's contents. */
export function SelectedFilePreview(props: Props) {
  if (props.file && props.display === 'icon') return <section aria-label={`Selected file: ${props.file.name}`} className={cardClass}><FileSelectionHeader {...props} file={props.file} /></section>
  return props.file ? <FilePreview key={`${props.file.name}:${props.file.lastModified}:${props.file.size}`} {...props} file={props.file} /> : null
}

function FilePreview({ file, onRemove, disabled = false, removeLabel = 'Remove selected file' }: Props & { file: File }) {
  const [result, setResult] = useState<{ file: File; url?: string; document?: OfficePreview; error?: string } | null>(null)
  const [sheet, setSheet] = useState(0)
  const image = /^image\/(png|jpeg|webp|gif|bmp|avif)$/i.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)
  const pdf = !image && (/\.pdf$/i.test(file.name) || file.type === 'application/pdf')
  useEffect(() => {
    let active = true, url: string | undefined
    setResult(null); setSheet(0)
    if (image || pdf) {
      if (file.size > 8 * 1024 * 1024) setResult({ file, error: 'This file is too large for a browser preview. Open the original on your device to check it.' })
      else if (typeof URL.createObjectURL === 'function') {
        url = URL.createObjectURL(new Blob([file], { type: pdf ? 'application/pdf' : file.type || `image/${file.name.split('.').pop()?.replace('jpg', 'jpeg')}` }))
        setResult({ file, url })
      } else setResult({ file, error: 'This browser cannot show a preview. Check the original file on your device.' })
    } else if (/\.(docx|xlsx|csv)$/i.test(file.name)) {
      void import('./file-preview-reader').then(module => module.officePreview(file)).then(document => {
        if (active) setResult({ file, document })
      }).catch(() => { if (active) setResult({ file, error: 'Preview unavailable. The file may be damaged, protected, or too complex. Open the original to check it, or choose another file.' }) })
    } else setResult({ file, error: 'Preview is not available for this file type. Open the original to check it.' })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [file, image, pdf])
  const current = result?.file === file ? result : null
  const document = current?.document
  const selectedSheet = document?.kind === 'spreadsheet' ? document.sheets[sheet] : null
  return <section aria-label={`Selected file preview: ${file.name}`} className={cardClass}>
    <FileSelectionHeader file={file} onRemove={onRemove} disabled={disabled} removeLabel={removeLabel} />
    {!current ? <p role="status" className="text-sm">Preparing preview…</p> : null}
    {current?.error ? <p role="status" className="text-sm">{current.error}</p> : null}
    {current?.url && image ? <img src={current.url} alt={`Preview of ${file.name}`} onError={() => setResult({ file, error: 'This image could not be displayed. Open the original to check it, or choose another image.' })} className="mx-auto max-h-72 w-auto max-w-full rounded-lg bg-white object-contain" /> : null}
    {current?.url && pdf ? <><Suspense fallback={<p role="status" className="text-sm">Preparing PDF preview…</p>}><PdfFilePreview file={file} /></Suspense><a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold underline">Open original PDF</a></> : null}
    {document?.kind === 'document' ? <><p className="text-xs">Word preview: a sample of the text and embedded pictures. Layout may differ when printed.</p><div className="max-h-80 space-y-3 overflow-auto rounded-lg bg-white p-4 text-sm text-[#003399]">{document.paragraphs.map((text, index) => <p key={index} className="whitespace-pre-wrap break-words">{text}</p>)}{document.images.map((src, index) => <img key={index} src={src} alt={`Embedded picture ${index + 1}`} className="max-h-48 max-w-full object-contain" />)}{!document.paragraphs.length && !document.images.length ? <p>No text or pictures could be shown. Open the original file to check it.</p> : null}</div></> : null}
    {selectedSheet && document?.kind === 'spreadsheet' ? <><p className="text-xs">File preview: first 30 rows and 24 columns, up to 30 worksheets. Formulas are not calculated; saved values are shown.</p>{document.sheets.length > 1 ? <label className="block text-sm font-semibold">Preview worksheet<select value={sheet} onChange={event => setSheet(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-[#003399]/20 bg-white p-2 text-[#003399]">{document.sheets.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label> : null}<div role="region" aria-label="Spreadsheet preview" tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-[#003399]/15 bg-white text-[#003399]"><table className="w-full border-collapse text-xs"><tbody>{selectedSheet.rows.map((row, index) => <tr key={index}><th scope="row" className="border border-[#003399]/10 bg-[#003399]/5 p-2">{index + 1}</th>{row.map((cell, column) => <td key={column} className="min-w-28 max-w-64 break-words border border-[#003399]/10 p-2 align-top">{cell}</td>)}</tr>)}</tbody></table>{!selectedSheet.rows.length ? <p className="p-3 text-sm">This worksheet is empty.</p> : null}</div></> : null}
    <p className="text-xs opacity-70">Check this file before continuing. To change it, choose another file.</p>
  </section>
}
