import JSZip from 'jszip'
import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { inspectPrintDocument } from './printing.document.ts'

async function pdf(pageCount: number) {
  const document = await PDFDocument.create()
  for (let index = 0; index < pageCount; index += 1) document.addPage()
  return Buffer.from(await document.save())
}

function uploaded(buffer: Buffer, name: string, mimetype: string) {
  return { buffer, originalname: name, mimetype, size: buffer.length } as Express.Multer.File
}

test('reads actual PDF pages and retains the same printable document', async () => {
  const source = uploaded(await pdf(3), 'report.pdf', 'application/pdf')
  const inspected = await inspectPrintDocument(source)
  assert.equal(inspected.pageCount, 3)
  assert.equal(inspected.printableFile, source)
  assert.match(inspected.sourceHash, /^[a-f0-9]{64}$/)
})

test('rejects a PDF with a signature but unreadable contents', async () => {
  await assert.rejects(inspectPrintDocument(uploaded(Buffer.from('%PDF-broken'), 'broken.pdf', 'application/pdf')), { code: 'PRINT_PDF_UNREADABLE' })
})

test('counts converted DOCX pages and keeps the rendered PDF for staff', async () => {
  const rendered = await pdf(2)
  const docx = uploaded(Buffer.from('PK[Content_Types].xml test'), 'thesis.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  let called = false
  const inspected = await inspectPrintDocument(docx, {
    rendererUrl: 'https://private-renderer.example',
    fetchImpl: async (url, init) => {
      called = true
      assert.equal(String(url), 'https://private-renderer.example/forms/libreoffice/convert')
      assert.equal(init?.method, 'POST')
      return new Response(new Uint8Array(rendered), { status: 200, headers: { 'content-type': 'application/pdf' } })
    },
  })
  assert.equal(called, true)
  assert.equal(inspected.pageCount, 2)
  assert.equal(inspected.printableName, 'thesis.pdf')
  assert.deepEqual(inspected.printableFile.buffer, rendered)
})


test('rejects malformed DOCX archives before starting a renderer',async()=>{
 const file=uploaded(Buffer.from('PK[Content_Types].xml corrupt'),'broken.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 await assert.rejects(inspectPrintDocument(file),{code:'PRINT_DOCX_INVALID'})
})
test('rejects a small compressed DOCX with excessive expanded content before rendering',async()=>{
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml','x'.repeat(26*1024*1024))
 const file=uploaded(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),'oversized.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 await assert.rejects(inspectPrintDocument(file),{code:'PRINT_DOCX_TOO_COMPLEX'})
})
