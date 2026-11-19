import { createHash } from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PDFDocument } from 'pdf-lib'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { validatePrintDocumentFile } from './printing.storage.ts'

const maxRenderedBytes = 20 * 1024 * 1024

async function countPdfPages(contents: Buffer) {
  try {
    const pdf = await PDFDocument.load(contents, { updateMetadata: false })
    const count = pdf.getPageCount()
    if (count < 1 || count > 500) throw new HttpError(422, 'PRINT_PAGE_COUNT_INVALID', 'The document must contain between 1 and 500 pages.')
    return count
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(422, 'PRINT_PDF_UNREADABLE', 'The PDF could not be read. Upload an unencrypted, valid PDF.')
  }
}

type RendererOptions = { fetchImpl?: typeof fetch; rendererUrl?: string; rendererToken?: string; paper?: {widthMm:number;heightMm:number} }

async function renderDocx(file: Express.Multer.File, options: RendererOptions) {
  const configured = options.rendererUrl ?? env.printing.docxRendererUrl
  if (!configured) {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
    try {
      const require = createRequire(import.meta.url)
      const executablePath = process.platform === 'win32'
        ? process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : await chromium.executablePath()
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath,
        headless: true,
      })
      const page = await browser.newPage()
      await page.setRequestInterception(true)
      page.on('request', request => {
        if (['data:', 'blob:'].some(prefix => request.url().startsWith(prefix))) void request.continue()
        else void request.abort()
      })
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="document"></div></body></html>')
      const docxScript = require.resolve('docx-preview')
      const docxRequire = createRequire(docxScript)
      await page.addScriptTag({ path: docxRequire.resolve('jszip/dist/jszip.min.js') })
      await page.addScriptTag({ path: docxScript })
      await Promise.race([page.evaluate(async base64 => {
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
        const renderer = (globalThis as typeof globalThis & { docx: { renderAsync: (data: Uint8Array, element: HTMLElement, style: null, options: Record<string, unknown>) => Promise<unknown> } }).docx
        await renderer.renderAsync(bytes, document.getElementById('document')!, null, {
          breakPages: true, ignoreLastRenderedPageBreak: false, useBase64URL: true,
          renderAltChunks: false,
        })
      }, file.buffer.toString('base64')), new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new HttpError(422,'PRINT_DOCX_TOO_COMPLEX','The document took too long to convert. Upload a PDF instead.')),20000);timer.unref()})])
      const width=options.paper?.widthMm??210,height=options.paper?.heightMm??297
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<10||height<10||width>1200||height>1200)throw new HttpError(422,'PRINT_PAPER_DIMENSIONS_INVALID','Review the paper dimensions before converting the document.')
      await page.addStyleTag({ content: `@page { size: ${width}mm ${height}mm; margin: 0 } html, body { padding: 0; margin: 0; background: white } .docx-wrapper { padding: 0 !important; background: white !important } .docx-wrapper > section.docx { margin: 0 !important; box-shadow: none !important; break-after: page } .docx-wrapper > section.docx:last-child { break-after: auto } .docx-wrapper > section.docx { width: ${width}mm !important; min-height: ${height}mm !important; box-sizing: border-box }` })
      const contents = Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true, timeout: 20000 }))
      if (contents.length > maxRenderedBytes) throw new HttpError(422, 'PRINT_RENDERED_FILE_TOO_LARGE', 'The converted document is too large. Please upload a PDF.')
      if (contents.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Invalid PDF output')
      return contents
    } catch (error) {
      if (error instanceof HttpError) throw error
      console.error('DOCX conversion failed:', error)
      throw new HttpError(503, 'PRINT_DOCX_RENDERER_UNAVAILABLE', 'DOCX conversion failed. Please upload a PDF or try again later.')
    } finally {
      await browser?.close()
    }
  }
  const endpoint = new URL('/forms/libreoffice/convert', configured)
  if (env.isProduction && endpoint.protocol !== 'https:') throw new HttpError(503, 'PRINT_DOCX_RENDERER_UNAVAILABLE', 'DOCX page counting is not securely configured.')
  const form = new FormData()
  let source=file.buffer
  if(options.paper){
    // Normalize the DOCX section page sizes before LibreOffice conversion.
    // The PDF returned by this conversion is also the preview and print artifact.
    const require=createRequire(import.meta.url),docxRequire=createRequire(require.resolve('docx-preview'))
    const JSZip=docxRequire('jszip') as typeof import('jszip')
    const zip=await JSZip.loadAsync(source)
    const xmlEntry=zip.file('word/document.xml')
    if(!xmlEntry)throw new HttpError(422,'PRINT_DOCX_INVALID','This DOCX does not contain a readable document.')
    const expanded=Object.values(zip.files).reduce((sum,entry)=>sum+Number((entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0),0)
    if(expanded>25*1024*1024)throw new HttpError(422,'PRINT_DOCX_TOO_COMPLEX','The expanded document is too large. Upload a PDF instead.')
    const xml=await xmlEntry.async('string'),width=Math.round(options.paper.widthMm*1440/25.4),height=Math.round(options.paper.heightMm*1440/25.4)
    if(xml.length>5*1024*1024||!Number.isFinite(width)||!Number.isFinite(height)||width<567||height<567||width>68032||height>68032)throw new HttpError(422,'PRINT_DOCX_INVALID','Review the document and paper dimensions.')
    zip.file('word/document.xml',xml.replace(/<w:pgSz\b[^>]*\/?>/g,`<w:pgSz w:w="${width}" w:h="${height}"/>`))
    source=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
  }
  form.set('files', new Blob([new Uint8Array(source)], { type: file.mimetype }), path.basename(file.originalname))
  const headers: Record<string, string> = {}
  const token = options.rendererToken ?? env.printing.docxRendererToken
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await (options.fetchImpl ?? fetch)(endpoint, { method: 'POST', body: form, headers, signal: AbortSignal.timeout(30000) })
  } catch {
    throw new HttpError(503, 'PRINT_DOCX_RENDERER_UNAVAILABLE', 'DOCX conversion is temporarily unavailable. Please upload a PDF or try again later.')
  }
  if (!response.ok) throw new HttpError(503, 'PRINT_DOCX_RENDERER_UNAVAILABLE', 'DOCX conversion failed. Please upload a PDF or try again later.')
  const declaredSize = Number(response.headers.get('content-length') ?? 0)
  if (declaredSize > maxRenderedBytes) throw new HttpError(422, 'PRINT_RENDERED_FILE_TOO_LARGE', 'The converted document is too large. Please upload a PDF.')
  if (!response.body) throw new HttpError(503, 'PRINT_DOCX_RENDERER_INVALID', 'DOCX conversion returned an empty document. Please upload a PDF.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxRenderedBytes) {
        await reader.cancel()
        throw new HttpError(422, 'PRINT_RENDERED_FILE_TOO_LARGE', 'The converted document is too large. Please upload a PDF.')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(503, 'PRINT_DOCX_RENDERER_UNAVAILABLE', 'DOCX conversion stopped unexpectedly. Please upload a PDF or try again later.')
  }
  const contents = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), received)
  if (contents.subarray(0, 5).toString('ascii') !== '%PDF-') throw new HttpError(503, 'PRINT_DOCX_RENDERER_INVALID', 'DOCX conversion returned an invalid document. Please upload a PDF.')
  return contents
}

export async function inspectPrintDocument(file?: Express.Multer.File, options: RendererOptions = {}) {
  const { extension, safeOriginalName } = validatePrintDocumentFile(file)
  if (!file) throw new HttpError(422, 'PRINT_FILE_REQUIRED', 'Select a PDF or DOCX document.')
  if(extension==='docx'&&!options.fetchImpl){
    try{
      const require=createRequire(import.meta.url),docxRequire=createRequire(require.resolve('docx-preview'))
      const JSZip=docxRequire('jszip') as typeof import('jszip'),zip=await JSZip.loadAsync(file.buffer)
      const entries=Object.values(zip.files),expanded=entries.reduce((sum,entry)=>sum+Number((entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0),0)
      if(entries.length>2000||expanded>25*1024*1024||!zip.file('word/document.xml'))throw new HttpError(422,'PRINT_DOCX_TOO_COMPLEX','This DOCX is too complex. Upload a PDF instead.')
    }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(422,'PRINT_DOCX_INVALID','The DOCX could not be read. Upload a valid document or PDF.')}
  }
  const sourceHash = createHash('sha256').update(file.buffer).digest('hex')
  const contents = extension === 'docx' ? await renderDocx(file, options) : file.buffer
  const pageCount = await countPdfPages(contents)
  const printableName = extension === 'docx' ? `${path.parse(safeOriginalName).name.slice(0, 251)}.pdf` : safeOriginalName
  const printableFile = extension === 'docx'
    ? { ...file, originalname: printableName, mimetype: 'application/pdf', buffer: contents, size: contents.length }
    : file
  return { pageCount, sourceHash, printableName, printableFile }
}
