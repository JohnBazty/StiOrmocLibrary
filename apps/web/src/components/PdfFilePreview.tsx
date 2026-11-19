import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readFile } from './file-preview-reader'
import { Button } from './ui'

GlobalWorkerOptions.workerSrc = workerUrl

function PdfPage({ document, page, zoom }: { document: PDFDocumentProxy; page: number; zoom:number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    let active = true, render: RenderTask | undefined
    void document.getPage(page).then(async next => {
      if (!active || !canvas.current) return
      const original = next.getViewport({ scale: 1 })
      const viewport = next.getViewport({ scale: Math.min(1.5, 900 / original.width, 1200 / original.height) })
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height)
      render = next.render({ canvas: canvas.current, viewport })
      await render.promise
      if (active) setState('ready')
    }).catch(() => { if (active) setState('error') })
    return () => { active = false; render?.cancel() }
  }, [document, page])
  return <div className="max-h-[65dvh] overflow-auto rounded-lg border border-[#0b5ea2]/15 bg-white p-1">
    {state === 'loading' ? <p role="status" className="p-3 text-sm text-[#0b5ea2]">Drawing page…</p> : null}
    {state === 'error' ? <p role="status" className="p-3 text-sm text-[#0b5ea2]">This page could not be displayed. Try another page or open the original PDF.</p> : null}
    <canvas ref={canvas} role="img" aria-label={`Preview of PDF page ${page}`} style={{width:`${zoom}%`,maxWidth:'none'}} className={`mx-auto h-auto ${state === 'ready' ? '' : 'hidden'}`} />
  </div>
}

export default function PdfFilePreview({ file }: { file: File }) {
  const [loaded, setLoaded] = useState<{ file: File; document: PDFDocumentProxy } | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [zoom,setZoom]=useState(100)

  useEffect(() => {
    let active = true, task: ReturnType<typeof getDocument> | undefined
    setLoaded(null); setError(''); setPage(1)
    void readFile(file).then(buffer => {
      if (!active) return
      task = getDocument({ data: buffer, cMapUrl: '/pdf-preview-assets/cmaps/', standardFontDataUrl: '/pdf-preview-assets/standard_fonts/', wasmUrl: '/pdf-preview-assets/wasm/', maxImageSize: 16 * 1024 * 1024, canvasMaxAreaInBytes: 16 * 1024 * 1024, verbosity: 0 })
      return task.promise
    }).then(document => { if (active && document) setLoaded({ file, document }) }).catch(() => {
      if (active) setError('This PDF cannot be previewed. It may need a password or be damaged. Open the original to check it.')
    })
    return () => { active = false; void Promise.resolve(task?.destroy()).catch(() => undefined) }
  }, [file])
  const document = loaded?.file === file ? loaded.document : null
  if (error) return <p role="status" className="text-sm">{error}</p>
  if (!document) return <p role="status" className="text-sm">Preparing PDF preview…</p>
  return <div aria-label={`PDF preview: ${file.name}`} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous page</Button><p aria-live="polite" className="text-xs font-semibold">Page {page} of {document.numPages}</p><Button variant="secondary" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>Next page</Button></div>
    <label className="flex min-h-11 items-center gap-3 text-sm">Zoom<select aria-label="Preview zoom" className="min-h-11 rounded-lg border px-3 text-slate-800" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[75,100,125,150,200].map(value=><option key={value} value={value}>{value}%</option>)}</select></label>
    <PdfPage key={page} document={document} page={page} zoom={zoom}/>
  </div>
}
