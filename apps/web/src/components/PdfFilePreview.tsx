import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readFile } from './file-preview-reader'
import { Button } from './ui'

GlobalWorkerOptions.workerSrc = workerUrl

function PdfPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
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
  return <div className="max-h-96 overflow-auto rounded-lg border border-[#003399]/15 bg-white p-1">
    {state === 'loading' ? <p role="status" className="p-3 text-sm text-[#003399]">Drawing page…</p> : null}
    {state === 'error' ? <p role="status" className="p-3 text-sm text-[#003399]">This page could not be displayed. Try another page or open the original PDF.</p> : null}
    <canvas ref={canvas} role="img" aria-label={`Preview of PDF page ${page}`} className={`mx-auto h-auto w-full max-w-full ${state === 'ready' ? '' : 'hidden'}`} />
  </div>
}

export default function PdfFilePreview({ file }: { file: File }) {
  const [loaded, setLoaded] = useState<{ file: File; document: PDFDocumentProxy } | null>(null)
  const [error, setError] = useState(''), [page, setPage] = useState(1)
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
    return () => { active = false; void task?.destroy().catch(() => undefined) }
  }, [file])
  const document = loaded?.file === file ? loaded.document : null
  if (error) return <p role="status" className="text-sm">{error}</p>
  if (!document) return <p role="status" className="text-sm">Preparing PDF preview…</p>
  return <div aria-label={`PDF preview: ${file.name}`} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous page</Button><p aria-live="polite" className="text-xs font-semibold">Page {page} of {document.numPages}</p><Button variant="secondary" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>Next page</Button></div>
    <PdfPage key={page} document={document} page={page} />
  </div>
}
