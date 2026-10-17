/** Local, read-only samples. Never run spreadsheet formulas, Word fields or embedded content. */
export type SheetPreview = { name: string; rows: string[][] }
export type OfficePreview = { kind: 'document'; paragraphs: string[]; images: string[] } | { kind: 'spreadsheet'; sheets: SheetPreview[] }
const MAX_FILE = 8 * 1024 * 1024
const MAX_EXPANDED = 32 * 1024 * 1024
const MAX_PART = 12 * 1024 * 1024

export function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('This file could not be read. Choose it again.'))
    reader.readAsArrayBuffer(file)
  })
}

/** Inspect declared sizes before asking the ZIP reader to expand an Office file. */
export function checkOfficeArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  let end = -1
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break }
  }
  const invalid = () => { throw new Error('A preview could not be read from this Office file. Check that it opens on your device.') }
  if (end < 0) return invalid()
  const count = view.getUint16(end + 10, true)
  const offset = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count > 2000 || offset >= end) return invalid()
  let position = offset, expanded = 0
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) return invalid()
    const size = view.getUint32(position + 24, true)
    expanded += size
    if (size > MAX_PART || expanded > MAX_EXPANDED || (view.getUint16(position + 8, true) & 1)) {
      throw new Error('This file is too complex for a browser preview. Open the original file on your device to check it.')
    }
    position += 46 + view.getUint16(position + 28, true) + view.getUint16(position + 30, true) + view.getUint16(position + 32, true)
    if (position > end) return invalid()
  }
}

function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('This document contains content that cannot be previewed safely.')
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('The file contents could not be previewed.')
  return document
}
const elements = (parent: Document | Element, name: string) => Array.from(parent.getElementsByTagNameNS('*', name))
const textRuns = (parent: Element) => elements(parent, 't').map(node => node.textContent ?? '').join('')

export function csvPreview(text: string): SheetPreview[] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]
  // Count separators outside quoted text, including regional Excel CSV separators.
  const counts = new Map([ [',', 0], [';', 0], ['\t', 0] ])
  let quoted = false
  for (const char of firstLine) { if (char === '"') quoted = !quoted; else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1) }
  const separator = [...counts].sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = [], row: string[] = []
  let cell = ''; quoted = false
  for (let i = 0; i < text.length && rows.length < 30; i++) {
    const char = text[i]
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (!quoted && (char === separator || char === '\n' || char === '\r')) {
      if (row.length < 24) row.push(cell.slice(0, 1000)); cell = ''
      if (char !== separator) { rows.push([...row]); row.length = 0; if (char === '\r' && text[i + 1] === '\n') i++ }
    } else if (cell.length < 1000) cell += char
  }
  if ((cell || row.length) && rows.length < 30) { if (row.length < 24) row.push(cell.slice(0, 1000)); rows.push(row) }
  return [{ name: 'CSV file', rows }]
}

export async function officePreview(file: File): Promise<OfficePreview> {
  if (file.size > MAX_FILE) throw new Error('This file is too large for a browser preview. Open the original on your device to check it.')
  const buffer = await readFile(file)
  if (/\.csv$/i.test(file.name)) return { kind: 'spreadsheet', sheets: csvPreview(new TextDecoder().decode(buffer).replace(/^\uFEFF/, '')) }
  checkOfficeArchive(buffer)
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const part = async (name: string) => { const entry = zip.file(name); if (!entry) throw new Error('The document is missing information needed for a preview.'); return xml(await entry.async('string')) }
  if (/\.docx$/i.test(file.name)) {
    const document = await part('word/document.xml')
    let characters = 0
    const paragraphs = elements(document, 'p').slice(0, 150).map(node => textRuns(node)).filter(text => {
      characters += text.length; return Boolean(text.trim()) && characters <= 20000
    })
    const images: string[] = []
    // Show a small sample of embedded raster pictures; never follow external relationships.
    for (const entry of Object.values(zip.files).filter(item => /^word\/media\/.*\.(png|jpe?g|webp)$/i.test(item.name)).slice(0, 4)) {
      const bytes = await entry.async('uint8array')
      if (bytes.length <= 2 * 1024 * 1024) {
        const type = /\.png$/i.test(entry.name) ? 'png' : /\.webp$/i.test(entry.name) ? 'webp' : 'jpeg'
        images.push(`data:image/${type};base64,${await entry.async('base64')}`)
      }
    }
    return { kind: 'document', paragraphs, images }
  }
  const workbook = await part('xl/workbook.xml'), relationships = await part('xl/_rels/workbook.xml.rels')
  const shared = zip.file('xl/sharedStrings.xml')
  const strings = shared ? elements(xml(await shared.async('string')), 'si').map(node => textRuns(node)) : []
  const sheets: SheetPreview[] = []
  for (const sheet of elements(workbook, 'sheet').slice(0, 30)) {
    const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const relation = elements(relationships, 'Relationship').find(node => node.getAttribute('Id') === id && node.getAttribute('TargetMode') !== 'External')
    const target = relation?.getAttribute('Target') ?? ''
    const name = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue
    const document = await part(name)
    const rows = elements(document, 'row').slice(0, 30).map(row => {
      const values: string[] = []
      for (const cell of elements(row, 'c')) {
        const letters = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0]
        const column = letters ? [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1 : values.length
        if (column > 23) continue
        const raw = elements(cell, 'v')[0]?.textContent ?? ''
        const type = cell.getAttribute('t')
        values[column] = (type === 's' ? strings[Number(raw)] ?? '' : type === 'inlineStr' ? textRuns(cell) : type === 'b' ? (raw === '1' ? 'Yes' : 'No') : raw).slice(0, 1000)
      }
      return Array.from({ length: values.length }, (_, i) => values[i] ?? '')
    })
    sheets.push({ name: sheet.getAttribute('name') || 'Worksheet', rows })
  }
  if (!sheets.length) throw new Error('No readable worksheets were found. Open the original file to check it.')
  return { kind: 'spreadsheet', sheets }
}
