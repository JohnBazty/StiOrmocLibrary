import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { HttpError } from '../../core/http-error.ts'
import { isValidIsbn, normalizeIsbn } from './catalog.validation.ts'

export const holdingsFields = ['title','author','isbn','edition','publisher','publicationYear','copyrightYear','pages','copies','missingCopies','accessions','barcodes','callNumber'] as const
export type HoldingsField = typeof holdingsFields[number]
export type SheetMapping = { sheet: string; headerRow: number; columns: Partial<Record<HoldingsField, number>>; categoryId?: number; location?: string; programId?: number }
export type HoldingsSheet = { name: string; rows: string[][]; mapping: SheetMapping; headers: string[] }
export type HoldingsData = { title: string; author: string; isbn: string; edition: string; publisher: string; publicationYear: string; copyrightYear: string; pages: string; copies: string; missingCopies: string; accessions: string; barcodes: string; callNumber: string; categoryId: number | null; location: string; programId: number | null; generateAccessions: boolean }
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
 title:/^(book title|title)$/,
 author:/^author(s| s)?$/,
 isbn:/^isbn( number)?$/,
 edition:/^edition$/,
 publisher:/^publisher$/,
 publicationYear:/^(year published|publication year|published date|published|year)$/,
 copyrightYear:/^(copyright|copyright year)$/,
 pages:/^(pages|page count|number of pages)$/,
 copies:/^(copies|cps|no of copies|no of|number of copies)$/,
 missingCopies:/^(missing|missing copies)$/,
 accessions:/^(accesion|accession)( number| no)?$/,
 barcodes:/^(barcode|barcodes)$/,
 callNumber:/^call number$/,
}
export function detectMapping(name:string, rows:string[][]): SheetMapping {
  let headerRow=1,best=0
  for(let i=0;i<Math.min(rows.length,30);i++){
    const score=rows[i].filter(value=>Object.values(aliases).some(pattern=>pattern.test(key(value)))).length
    if(score>best){best=score;headerRow=i+1}
  }
  const columns:SheetMapping['columns']={}
  rows[headerRow-1]?.forEach((value,index)=>{
    for(const field of holdingsFields) if(aliases[field].test(key(value))) columns[field]=index+1
  })
  return {sheet:name,headerRow,columns}
}
export async function readHoldings(file: {buffer:Buffer;originalname:string}) {
  if(!file.buffer.length || file.buffer.length>4*1024*1024) throw bad('Choose a workbook or CSV up to 4 MB.')
  const workbook=new ExcelJS.Workbook()
  try {
    if(/\.xlsx$/i.test(file.originalname)){
      if(file.buffer.length<22) throw bad('The workbook is incomplete.')
      validateXlsxArchive(file.buffer)
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    }else if(/\.csv$/i.test(file.originalname)){
      await workbook.csv.read(Readable.from(file.buffer),{map:value=>String(value??''),parserOptions:{maxRows:10001}})
    }else throw bad('Only XLSX and UTF-8 CSV files are supported.')
  }catch(error){if(error instanceof HttpError)throw error;throw bad('The file cannot be read. Save it as an unencrypted XLSX or UTF-8 CSV and try again.')}
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
export function mappedRows(sheets:HoldingsSheet[],mappings:SheetMapping[]){
  const seen=new Set<string>()
  const items:Array<{sheet:string;sourceRow:number;source:string[];data:HoldingsData}>=[]
  let ignored=0
  for(const mapping of mappings){
    if(!mapping || typeof mapping!=='object' || typeof mapping.sheet!=='string' || !mapping.columns || typeof mapping.columns!=='object' || Array.isArray(mapping.columns))throw bad('Confirm the sheet name and column mappings for every selected sheet.')
    const sheet=sheets.find(s=>s.name===mapping.sheet)
    if(!sheet || seen.has(mapping.sheet)) throw bad('Select each existing sheet once.')
    seen.add(mapping.sheet)
    if(!Number.isInteger(mapping.headerRow)||mapping.headerRow<1||mapping.headerRow>sheet.rows.length)throw bad('Choose a valid header row.')
    if(!mapping.columns.title||!mapping.columns.author||!mapping.columns.copies)throw bad('Map Title, Author and Copies for every selected sheet.')
    for(const column of Object.values(mapping.columns))if(!Number.isInteger(column)||Number(column)<1||Number(column)>40)throw bad('Choose valid column numbers.')
    for(let i=mapping.headerRow;i<sheet.rows.length;i++){
      const source=sheet.rows[i]
      const values=Object.fromEntries(holdingsFields.map(field=>[field,mapping.columns[field]?(field==='accessions'||field==='barcodes'?String(source[Number(mapping.columns[field])-1]??'').trim():clean(source[Number(mapping.columns[field])-1])):''])) as Record<HoldingsField,string>
      // Signature blocks terminate the holdings table in the supplied campus sheets.
      // Numeric copy rows are retained even if a genuine title contains these words.
      if(!/^\d+$/.test(values.copies)&&source.some(cell=>/^(prepared by|noted by|checked by|certified true(?: and)?(?: correct)?|certified by)\b/i.test(clean(cell)))){ignored+=sheet.rows.length-i;break}
      if(!values.title&&!values.author&&/^(copies|date|year|published)$/i.test(values.copies)){ignored++;continue}
      if(!values.title && !values.copies){ignored++;continue}
      if(/^(book title|title|total|grand total)$/i.test(values.title) || /^(prepared by|noted by|checked by|certified by)\s*:/i.test(values.title) || (!values.title && /total/i.test(source.join(' ')))){ignored++;continue}
      items.push({sheet:sheet.name,sourceRow:i+1,source,data:{...values,isbn:normalizeIsbn(values.isbn),categoryId:positiveId(mapping.categoryId),location:clean(mapping.location),programId:positiveId(mapping.programId),generateAccessions:false}})
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
  for(const field of ['publicationYear','copyrightYear'] as const){
    const n=Number(data[field]);if(data[field]&&(!Number.isInteger(n)||n<1000||n>new Date().getFullYear()))errors.push(`${field==='copyrightYear'?'Copyright':'Publication'} year must be a valid year; leave unknown years blank.`)
  }
  if(data.pages && (!Number.isSafeInteger(Number(data.pages)) || Number(data.pages)<1))errors.push('Pages must be a positive whole number or blank.')
  if(needsCopies){
    const copies=Number(data.copies), missing=Number(data.missingCopies||0)
    if(!Number.isInteger(copies)||copies<1||copies>100)errors.push('Copies must be a whole number from 1 to 100.')
    if(!Number.isInteger(missing)||missing<0||missing>copies)errors.push('Missing copies must be a whole number between zero and the copy count.')
    if(!data.categoryId)errors.push('Choose a category.')
    if(!data.location || data.location.length>100)errors.push('Choose a managed shelf location.')
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
