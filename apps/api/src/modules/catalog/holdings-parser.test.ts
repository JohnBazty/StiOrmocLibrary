import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { detectMapping, mappedRows, readHoldings, validateHoldingsData, type HoldingsData } from './holdings-parser.ts'

test('different holdings headers keep copyright and publication years separate',()=>{
 const shs=detectMapping('SHS BOOKS',[['NO.','ACCESION #','AUTHOR','BOOK TITLE','PUBLISHER','COPYRIGHT','PAGES','COPIES','MISSING']])
 assert.equal(shs.columns.copyrightYear,6);assert.equal(shs.columns.publicationYear,undefined);assert.equal(shs.columns.accessions,2)
 const hrm=detectMapping('CHED HRM',[['No.','ACCESION #','Book Title','Author/s','Publisher','Year','Pages','ISBN','Copies']])
 assert.equal(hrm.columns.publicationYear,6);assert.equal(hrm.columns.author,4)
 const it=detectMapping('IT BOOKS',[['NO.','ACCESION #','AUTHOR','BOOK TITLE','EDITION','PUBLISHED','PUBLISHER','NO. OF']])
 assert.equal(it.columns.copies,8);assert.equal(it.columns.publicationYear,6)
})
test('XLSX uses cached formula results without evaluating formulas and preserves multiline identifiers',async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Holdings')
 sheet.addRows([['Title','Author','Copies','Accesion #'],['Total Quality Management','Author',{formula:'1+1',result:2},'ACC-A\nACC-B'],['Total','','2']])
 const buffer=Buffer.from(await workbook.xlsx.writeBuffer()),sheets=await readHoldings({buffer,originalname:'holdings.xlsx'})
 const parsed=mappedRows(sheets,sheets.map(s=>s.mapping))
 assert.equal(parsed.items.length,1);assert.equal(parsed.items[0].data.copies,'2');assert.equal(parsed.items[0].data.accessions,'ACC-A\nACC-B')
})
test('ambiguous accession counts, missing stock and invalid ISBNs require correction',()=>{
 const data:HoldingsData={title:'Book',author:'Author',isbn:'123',edition:'',publisher:'',publicationYear:'',copyrightYear:'',pages:'',copies:'2',missingCopies:'3',accessions:'ACC-A',barcodes:'',callNumber:'',categoryId:1,location:'Shelf',programId:null,generateAccessions:false}
 const errors=validateHoldingsData(data)
 assert.ok(errors.some(e=>e.includes('ISBN')));assert.ok(errors.some(e=>e.includes('Missing copies')));assert.ok(errors.some(e=>e.includes('accession number')))
 assert.equal(validateHoldingsData({...data,isbn:'',missingCopies:'1',generateAccessions:true}).length,0)
})
test('signature blocks and split header continuations are excluded from holdings',()=>{
 const rows=[['Title','Author','NO. OF'],['','','COPIES'],['Total Quality Management','Author','2'],['Certified True and Correct by:','Prepared by:',''],['School Administrator','School Librarian','']]
 const mapping=detectMapping('IT',rows),parsed=mappedRows([{name:'IT',rows,mapping,headers:rows[0]}],[mapping])
 assert.equal(parsed.items.length,1);assert.equal(parsed.items[0].data.title,'Total Quality Management');assert.equal(parsed.ignored,3)
})
test('unsupported, corrupt, oversized and too-wide files are rejected before staging',async()=>{
 await assert.rejects(readHoldings({buffer:Buffer.from('bad'),originalname:'x.xlsx'}))
 await assert.rejects(readHoldings({buffer:Buffer.alloc(4194305),originalname:'x.csv'}))
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Wide');sheet.getCell(1,41).value='Too wide'
 await assert.rejects(readHoldings({buffer:Buffer.from(await workbook.xlsx.writeBuffer()),originalname:'x.xlsx'}))
})
test('malformed mapping payloads return an actionable validation error',()=>{
 const rows=[['Title','Author','Copies'],['Book','Author','1']],mapping=detectMapping('Books',rows)
 const sheets=[{name:'Books',rows,mapping,headers:rows[0]}]
 for(const invalid of [null,{sheet:'Books',headerRow:1},{sheet:'Books',headerRow:1,columns:[]}]){
  assert.throws(()=>mappedRows(sheets,[invalid as unknown as typeof mapping]),/Confirm the sheet name and column mappings/)
 }
})
