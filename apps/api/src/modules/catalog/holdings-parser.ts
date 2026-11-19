import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { inflateRawSync } from 'node:zlib'
import { HttpError } from '../../core/http-error.ts'
import { isValidIsbn, normalizeIsbn } from './catalog.validation.ts'
import { cleanImportValue, matchImportReference, type ImportCorrection, type ImportReferences } from './holdings-cleanup.ts'

const legacyHoldingsFields = ['title','author','isbn','edition','publisher','publicationYear','copyrightYear','pages','copies','missingCopies','accessions','barcodes','callNumber'] as const
export const holdingsFields = [...legacyHoldingsFields, 'categoryName', 'shelfLocation', 'summary', 'deweyNumber', 'volumes', 'fundSource', 'fundDetail', 'costPhp', 'receivedOn', 'remarks'] as const
export type HoldingsField = typeof holdingsFields[number]
export type SheetMapping = { sheet: string; headerRow: number; columns: Partial<Record<HoldingsField, number>>; categoryId?: number; location?: string; programId?: number }
export type HoldingsSheet = { name: string; rows: string[][]; mapping: SheetMapping; headers: string[] }
import type { ReviewedDewey } from "./dewey.service.ts"
export type HoldingsData = { reviewedDewey?: ReviewedDewey; summary?: string; deweyNumber?: string; volumes?: string; fundSource?: string; fundDetail?: string; costPhp?: string; receivedOn?: string; remarks?: string; title: string; author: string; isbn: string; edition: string; publisher: string; publicationYear: string; copyrightYear: string; pages: string; copies: string; missingCopies: string; accessions: string; barcodes: string; callNumber: string; categoryId: number | null; location: string; locationId?: number; shelfColumn?: number; shelfRow?: number; programId: number | null; generateAccessions: boolean; categoryName?: string; shelfLocation?: string; autoCorrections?: ImportCorrection[] }
const bad = (message: string) => new HttpError(422,'HOLDINGS_FILE_INVALID',message)
export const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g,' ')
export const key = (value: unknown) => clean(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export const positiveId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null

/** Bound ZIP expansion before ExcelJS decompresses untrusted XLSX input. */
export function validateXlsxArchive(bytes: Buffer) {
  if (bytes.readUInt32LE(0)!==0x04034b50) throw bad('Choose an unencrypted XLSX workbook or UTF-8 CSV file.')
  let end=-1
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}
  if(end<0) throw bad('The XLSX archive is incomplete.')
  const count=bytes.readUInt16LE(end+10), start=bytes.readUInt32LE(end+16)
  if(count>2000 || start>=bytes.length || bytes.readUInt16LE(end+4)!==0) throw bad('This workbook is too large or uses an unsupported archive format.')
  let offset=start,total=0
  for(let i=0;i<count;i++){
    if(offset+46>end || bytes.readUInt32LE(offset)!==0x02014b50) throw bad('The XLSX archive is damaged.')
    const size=bytes.readUInt32LE(offset+24), nameLength=bytes.readUInt16LE(offset+28), extra=bytes.readUInt16LE(offset+30), comment=bytes.readUInt16LE(offset+32)
    const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8')
    total+=size
    const unsafeBinary=/vbaProject|\/activeX\/|\/embeddings\//i.test(name)||(/\.bin$/i.test(name)&&!/^xl\/printerSettings\/printerSettings\d+\.bin$/i.test(name))
    if(size>16*1024*1024 || total>32*1024*1024 || unsafeBinary) throw bad('Use a workbook without macros or embedded executable objects, with at most 32 MB of expanded content.')
    offset+=46+nameLength+extra+comment
  }
}
function cellText(value: ExcelJS.CellValue): string {
  if(value===null || value===undefined) return ''
  if(value instanceof Date) return String(value.getFullYear())
  if(typeof value==='object'){
    if('richText' in value) return value.richText.map(x=>x.text).join('')
    if('formula' in value || 'sharedFormula' in value) return 'result' in value ? cellText(value.result as ExcelJS.CellValue) : ''
    if('text' in value) return value.text
    return ''
  }
  return String(value)
}
const aliases: Record<HoldingsField, RegExp> = {
 title:/^(book title|title|book name|name of book)$/,
 author:/^(author(s| s)?|writer(s)?|written by)$/,
 isbn:/^isbn( number| 10| 13)?$/,
 edition:/^edition$/,
 publisher:/^publisher$/,
 publicationYear:/^(year published|publication year|published date|published|year)$/,
 copyrightYear:/^(copyright|copyright year)$/,
 pages:/^(pages|page count|number of pages)$/,
 copies:/^(copies|copy count|total copies|quantity|qty|cps|no of copies|no of|number of copies|quantity of copies)$/,
 missingCopies:/^(missing|missing copies)$/,
 accessions:/^(accesion|accession)( numbers?| nos?)?$/,
 barcodes:/^(book )?barcodes?$/,
 callNumber:/^(call number|ddc cutter(s)?( table)?|ddc and cutter(s)?( table)?)$/,
 categoryName:/^(category|category name|classification)$/,
 shelfLocation:/^(shelf|shelf location|shelf label|location|book location)$/,
 summary:/^(abstract|summary|abstract summary|synopsis|book summary)$/,
 deweyNumber:/^(dewey|dewey number|dewey classification|ddc|ddc code|ddc number)$/,
 volumes:/^volumes?$/,
 fundSource:/^(source of fund|fund source)$/,
 fundDetail:/^(fund details?|fund note)$/,
 costPhp:/^(cost price(?: php(?: each copy)?)?|cost php|cost per copy|price|unit cost)$/,
 receivedOn:/^(date received|received on|acquired at|acquisition date)$/,
 remarks:/^remarks?$/,
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
}

/** Fallback reader for OpenXML workbooks that use `<x:...>` namespace prefixes which ExcelJS fails to parse. */
function readPrefixedOpenXmlSheets(bytes: Buffer): Array<{ name: string; rows: string[][] }> {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  let offset = start
  for (let i = 0; i < count; i++) {
    const method = bytes.readUInt16LE(offset + 10)
    const compSize = bytes.readUInt32LE(offset + 20)
    const nameLen = bytes.readUInt16LE(offset + 28)
    const extraLen = bytes.readUInt16LE(offset + 30)
    const commentLen = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLen).toString('utf8').replace(/^\/+/, '')
    const localNameLen = bytes.readUInt16LE(localOffset + 26)
    const localExtraLen = bytes.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = bytes.subarray(dataStart, dataStart + compSize)
    if (/\.(xml|rels)$/i.test(name)) {
      files.set(name, method === 8 ? inflateRawSync(raw) : raw)
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  const wbXml = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const relsXml = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  if (!wbXml || !relsXml) throw bad('The workbook is incomplete.')
  const sstXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  const sharedStrings: string[] = []
  for (const siMatch of sstXml.matchAll(/<(?:[a-zA-Z0-9_]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?si>/g)) {
    const parts: string[] = []
    for (const tMatch of siMatch[1].matchAll(/<(?:[a-zA-Z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g)) {
      parts.push(decodeXmlEntities(tMatch[1]))
    }
    sharedStrings.push(parts.join(''))
  }
  const relTargets = new Map<string, string>()
  for (const relMatch of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const attrs = relMatch[1]
    const id = attrs.match(/\bId="([^"]+)"/)?.[1]
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) {
      const normalizedTarget = target.replace(/^\/+/, '')
      relTargets.set(id, normalizedTarget.startsWith('xl/') ? normalizedTarget : `xl/${normalizedTarget}`)
    }
  }
  const parsedSheets: Array<{ name: string; rows: string[][] }> = []
  for (const sheetMatch of wbXml.matchAll(/<(?:[a-zA-Z0-9_]+:)?sheet\b([^>]*?)\/?>/g)) {
    const attrs = sheetMatch[1]
    const sheetName = decodeXmlEntities(attrs.match(/\bname="([^"]+)"/)?.[1] ?? 'Sheet')
    const rId = attrs.match(/\b(?:r:)?id="([^"]+)"/)?.[1] ?? ''
    const target = relTargets.get(rId)
    const sheetXml = target ? files.get(target)?.toString('utf8') ?? '' : ''
    if (!sheetXml) continue
    const rowMap = new Map<number, Map<number, string>>()
    let maxRow = 0, maxCol = 0
    for (const rowMatch of sheetXml.matchAll(/<(?:[a-zA-Z0-9_]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?row>/g)) {
      const rAttr = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] ?? 0)
      const rowIdx = rAttr > 0 ? rAttr : maxRow + 1
      if (rowIdx > maxRow) maxRow = rowIdx
      const cells = rowMap.get(rowIdx) ?? new Map<number, string>()
      let nextCol = 1
      for (const cellMatch of rowMatch[2].matchAll(/<(?:[a-zA-Z0-9_]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?c>)/g)) {
        const cAttrs = cellMatch[1], cBody = cellMatch[2] ?? ''
        const refLetters = cAttrs.match(/\br="([A-Z]+)\d+"/)?.[1]
        let colIdx = nextCol
        if (refLetters) {
          colIdx = 0
          for (let k = 0; k < refLetters.length; k++) colIdx = colIdx * 26 + (refLetters.charCodeAt(k) - 64)
        }
        nextCol = colIdx + 1
        if (colIdx > maxCol) maxCol = colIdx
        const cType = cAttrs.match(/\bt="([^"]+)"/)?.[1] ?? ''
        let val = ''
        if (cType === 'inlineStr') {
          val = [...cBody.matchAll(/<(?:[a-zA-Z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g)].map(m => decodeXmlEntities(m[1])).join('')
        } else {
          const rawVal = decodeXmlEntities(cBody.match(/<(?:[a-zA-Z0-9_]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?v>/)?.[1] ?? '')
          val = cType === 's' && /^\d+$/.test(rawVal) ? (sharedStrings[Number(rawVal)] ?? '') : rawVal
        }
        cells.set(colIdx, val.slice(0, 2000))
      }
      rowMap.set(rowIdx, cells)
    }
    if (maxRow > 10000 || maxCol > 40) throw bad('Each sheet must have at most 10,000 rows and 40 columns.')
    const rows: string[][] = []
    for (let r = 1; r <= maxRow; r++) {
      const cells = rowMap.get(r)
      rows.push(Array.from({ length: maxCol }, (_, c) => cells?.get(c + 1) ?? ''))
    }
    parsedSheets.push({ name: sheetName, rows })
  }
  return parsedSheets
}
export function detectMapping(name:string, rows:string[][]): SheetMapping {
  let headerRow=1,best=0
  for(let i=0;i<Math.min(rows.length,30);i++){
    const score=rows[i].filter(value=>Object.values(aliases).some(pattern=>pattern.test(key(value)))).length
    if(score>best){best=score;headerRow=i+1}
  }
  const columns:SheetMapping['columns']={}
  for (const field of holdingsFields) {
    const matches = (rows[headerRow - 1] ?? []).flatMap((value, index) => aliases[field].test(key(value)) ? [index + 1] : [])
    // Competing columns must be chosen by the librarian instead of silently taking the last one.
    if (matches.length === 1) columns[field] = matches[0]
  }
  return {sheet:name,headerRow,columns}
}
export async function readHoldings(file: {buffer:Buffer;originalname:string}) {
  if(!file.buffer.length || file.buffer.length>4*1024*1024) throw bad('Choose a workbook or CSV up to 4 MB.')
  const workbook=new ExcelJS.Workbook()
  let fallbackSheets: Array<{ name: string; rows: string[][] }> | null = null
  try {
    if(/\.xlsx$/i.test(file.originalname)){
      if(file.buffer.length<22) throw bad('The workbook is incomplete.')
      validateXlsxArchive(file.buffer)
      try {
        await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
      } catch (xlsxErr) {
        if (xlsxErr instanceof HttpError) throw xlsxErr
        fallbackSheets = readPrefixedOpenXmlSheets(file.buffer)
        if (!fallbackSheets.length) throw xlsxErr
      }
    }else if(/\.csv$/i.test(file.originalname)){
      await workbook.csv.read(Readable.from(file.buffer),{map:value=>String(value??''),parserOptions:{maxRows:10001}})
    }else throw bad('Only XLSX and UTF-8 CSV files are supported.')
  }catch(error){if(error instanceof HttpError)throw error;throw bad('The file cannot be read. Save it as an unencrypted XLSX or UTF-8 CSV and try again.')}
  if (fallbackSheets) {
    if (fallbackSheets.length > 12) throw bad('Import at most 12 sheets at a time.')
    const sheets: HoldingsSheet[] = []
    let total = 0
    for (const sheet of fallbackSheets) {
      total += sheet.rows.length
      if (total > 20000) throw bad('Import at most 20,000 source rows at a time.')
      const mapping = detectMapping(sheet.name, sheet.rows)
      sheets.push({ name: sheet.name, rows: sheet.rows, mapping, headers: sheet.rows[mapping.headerRow - 1] ?? [] })
    }
    return sheets
  }
  if(workbook.worksheets.length>12) throw bad('Import at most 12 sheets at a time.')
  const sheets:HoldingsSheet[]=[]
  let total=0
  for(const sheet of workbook.worksheets){
    if(sheet.rowCount>10000 || sheet.columnCount>40) throw bad('Each sheet must have at most 10,000 rows and 40 columns.')
    const rows:string[][]=[]
    for(let i=1;i<=sheet.rowCount;i++){
      const row=sheet.getRow(i)
      rows.push(Array.from({length:sheet.columnCount},(_,j)=>cellText(row.getCell(j+1).value).slice(0,2000)))
    }
    total+=rows.length
    if(total>20000) throw bad('Import at most 20,000 source rows at a time.')
    const mapping=detectMapping(sheet.name,rows)
    sheets.push({name:sheet.name,rows,mapping,headers:rows[mapping.headerRow-1]??[]})
  }
  return sheets
}
export function holdingsMappingIdentity(mappings: SheetMapping[]) {
  return JSON.stringify(mappings.map(mapping => ({ ...mapping, columns: Object.fromEntries(holdingsFields
    .filter(field => (legacyHoldingsFields as readonly string[]).includes(field) || mapping.columns[field])
    .map(field => [field, mapping.columns[field] ?? null])) })).sort((a, b) => a.sheet.localeCompare(b.sheet)))
}
function recordReferenceCorrection(changes: ImportCorrection[], field: string, before: string, after: string, reason: 'category' | 'shelf') {
  const existing = changes.find(change => change.field === field)
  if (existing) { existing.after = after; existing.reason = reason }
  else changes.push({ field, before, after, reason })
}
/** `requireCopies: false` is for Find book details, which lists books without adding copies. */
export function mappedRows(sheets:HoldingsSheet[],mappings:SheetMapping[],references:ImportReferences={categories:[],locations:[]},{requireCopies=true}:{requireCopies?:boolean}={}){
  const seen=new Set<string>()
  const items:Array<{sheet:string;sourceRow:number;source:string[];data:HoldingsData}>=[]
  let ignored=0
  for(const mapping of mappings){
    if(!mapping || typeof mapping!=='object' || typeof mapping.sheet!=='string' || !mapping.columns || typeof mapping.columns!=='object' || Array.isArray(mapping.columns))throw bad('Confirm the sheet name and column mappings for every selected sheet.')
    const sheet=sheets.find(s=>s.name===mapping.sheet)
    if(!sheet || seen.has(mapping.sheet)) throw bad('Select each existing sheet once.')
    seen.add(mapping.sheet)
    if(!Number.isInteger(mapping.headerRow)||mapping.headerRow<1||mapping.headerRow>sheet.rows.length)throw bad('Choose a valid header row.')
    // An ISBN can stand in for Title and Author: the book lookup or the librarian fills them before a row is saved.
    if((requireCopies&&!mapping.columns.copies)||(!mapping.columns.title&&!mapping.columns.isbn))throw bad(requireCopies?'Map Copies, and Title or ISBN, for every selected sheet.':'Map Title or ISBN for every selected sheet.')
    for(const column of Object.values(mapping.columns))if(!Number.isInteger(column)||Number(column)<1||Number(column)>40)throw bad('Choose valid column numbers.')
    for(let i=mapping.headerRow;i<sheet.rows.length;i++){
      const source=sheet.rows[i]
      const corrections: ImportCorrection[] = []
      const values=Object.fromEntries(holdingsFields.map(field=>{
        const result = cleanImportValue(field, mapping.columns[field] ? source[Number(mapping.columns[field]) - 1] : '')
        if (result.correction) corrections.push(result.correction)
        return [field, result.value]
      })) as Record<HoldingsField,string>
      // Signature blocks terminate the holdings table in the supplied campus sheets.
      // Numeric copy rows are retained even if a genuine title contains these words.
      if(!/^\d+$/.test(values.copies)&&source.some(cell=>/^(prepared by|noted by|checked by|certified true(?: and)?(?: correct)?|certified by)\b/i.test(clean(cell)))){ignored+=sheet.rows.length-i;break}
      if(!values.title&&!values.author&&/^(copies|date|year|published)$/i.test(values.copies)){ignored++;continue}
      if(!values.title && (requireCopies ? !values.copies : !values.isbn)){ignored++;continue}
      if(/^(book title|title|total|grand total)$/i.test(values.title) || /^(prepared by|noted by|checked by|certified by)\s*:/i.test(values.title) || (!values.title && /total/i.test(source.join(' ')))){ignored++;continue}
      let categoryId = positiveId(mapping.categoryId), location = clean(mapping.location)
      if (values.categoryName) {
        const category = matchImportReference(values.categoryName, references.categories)
        categoryId = positiveId(category?.id)
        if (category && category.name !== values.categoryName) recordReferenceCorrection(corrections, 'categoryName', values.categoryName, category.name, 'category')
      }
      if (values.shelfLocation) {
        const shelf = matchImportReference(values.shelfLocation, references.locations)
        location = shelf?.name ?? ''
        if (shelf && shelf.name !== values.shelfLocation) recordReferenceCorrection(corrections, 'shelfLocation', values.shelfLocation, shelf.name, 'shelf')
      }
      const rawDewey = values.deweyNumber || values.callNumber.match(/^(\d{3}(?:\.\d+)?)\b/)?.[1] || ''
      const reviewedDewey: ReviewedDewey | undefined = /^\d{3}(?:\.\d+)?$/.test(rawDewey)
        ? { code: rawDewey, source: 'manual', sourceUrl: null, isbn: values.isbn }
        : undefined
      items.push({sheet:sheet.name,sourceRow:i+1,source,data:{...values,categoryId,location,programId:positiveId(mapping.programId),generateAccessions:false,...(reviewedDewey ? {reviewedDewey} : {}),...(corrections.length ? {autoCorrections:corrections} : {})}})
    }
  }
  if(!items.length)throw bad('No book entries were found using the selected mapping.')
  if(items.length>5000)throw bad('Stage at most 5,000 book entries at a time.')
  return {items,ignored}
}
export const identityList=(value:string)=>value.split(/[;\n]+/).map(x=>x.trim().toUpperCase()).filter(Boolean)
export function validateHoldingsData(data:HoldingsData, needsCopies=true){
  const errors:string[]=[]
  if(!data.title || data.title.length>255)errors.push('Title is required, up to 255 characters.')
  if(!data.author || data.author.length>255)errors.push('Author is required, up to 255 characters.')
  if(data.isbn && !isValidIsbn(normalizeIsbn(data.isbn)))errors.push('ISBN checksum is invalid. Correct it or clear an unknown ISBN.')
  if(data.edition.length>100||data.publisher.length>255||data.callNumber.length>100)errors.push('Edition, publisher or call number is too long.')
  if((data.summary??'').length>5000)errors.push('Summary is too long; keep it to 5,000 characters.')
  for(const field of ['publicationYear','copyrightYear'] as const){
    const n=Number(data[field]);if(data[field]&&(!/^\d+$/.test(data[field])||!Number.isInteger(n)||n<1000||n>new Date().getFullYear()))errors.push(`${field==='copyrightYear'?'Copyright':'Publication'} year must be a valid year; leave unknown years blank.`)
  }
  if(data.pages && (!/^\d+$/.test(data.pages) || !Number.isSafeInteger(Number(data.pages)) || Number(data.pages)<1))errors.push('Pages must be a positive whole number or blank.')
  if(needsCopies){
    for(const field of ['locationId','shelfColumn','shelfRow'] as const)if(data[field]!==undefined&&(!Number.isSafeInteger(data[field])||Number(data[field])<1))errors.push('Choose a valid shelf, column and row.')
    const copies=Number(data.copies), missing=Number(data.missingCopies||0)
    if(!/^\d+$/.test(data.copies)||!Number.isInteger(copies)||copies<1||copies>100)errors.push('Copies must be a whole number from 1 to 100.')
    if((data.missingCopies && !/^\d+$/.test(data.missingCopies))||!Number.isInteger(missing)||missing<0||missing>copies)errors.push('Missing copies must be a whole number between zero and the copy count.')
    if(!data.categoryId)errors.push(data.categoryName ? `Category “${data.categoryName}” could not be matched safely. Choose an existing category.` : 'Choose a category.')
    if(!data.location || data.location.length>100)errors.push(data.shelfLocation ? `Shelf “${data.shelfLocation}” could not be matched safely. Choose an active shelf.` : 'Choose a managed shelf location.')
    for(const field of ['accessions','barcodes'] as const){
      const ids=identityList(data[field])
      if(field==='accessions' && data.generateAccessions)continue
      if(ids.length&&ids.length!==copies)errors.push(`Provide one ${field==='accessions'?'accession number':'barcode'} per copy (separate with semicolons), or explicitly generate missing accession numbers.`)
      if(ids.some(x=>x.length>100)||new Set(ids).size!==ids.length)errors.push(`The ${field} contain duplicates or values longer than 100 characters.`)
    }
  }
  return errors
}
export function holdingsIdentity(data:HoldingsData){return data.isbn?`isbn:${normalizeIsbn(data.isbn)}`:`text:${key(data.title)}|${key(data.author)}`}
