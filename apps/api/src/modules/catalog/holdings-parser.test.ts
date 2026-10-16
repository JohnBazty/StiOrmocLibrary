import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { detectMapping, holdingsMappingIdentity, mappedRows, readHoldings, validateHoldingsData, type HoldingsData } from './holdings-parser.ts'

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


test('plain CSV headings and blank template preserve book quantities without guessing',async()=>{
 const csv='\uFEFFTitle,Author,Total copies,ISBN-13,Publication year,Copyright year,Accession numbers,Book barcodes\r\nSample Book,Sample Writer,2,,2020,2019,ACC-A;ACC-B,COPY-A;COPY-B\r\n'
 const sheets=await readHoldings({buffer:Buffer.from(csv,'utf8'),originalname:'books.csv'})
 const mapping={...sheets[0].mapping,categoryId:1,location:'Shelf A'}
 assert.equal(mapping.columns.copies,3);assert.equal(mapping.columns.isbn,4)
 assert.equal(mapping.columns.accessions,7);assert.equal(mapping.columns.barcodes,8)
 const parsed=mappedRows(sheets,[mapping]);assert.equal(parsed.items.length,1)
 assert.equal(parsed.items[0].data.copies,'2');assert.equal(parsed.items[0].data.accessions,'ACC-A;ACC-B')
 assert.equal(parsed.items[0].data.barcodes,'COPY-A;COPY-B');assert.equal(parsed.items[0].data.generateAccessions,false)
 assert.equal(validateHoldingsData(parsed.items[0].data).length,0)
 assert.equal(detectMapping('Books',[['Book name','Writer','Qty']]).columns.copies,3)
})

test('cleanup keeps original source cells and only uniquely recognizes existing references', () => {
 const rows = [['Book name','Writer','Quantity','ISBN','Category','Shelf'],['  Jane   Eyre  ',' Charlotte  Brontë ','002.00','ISBN-13: 978-0-14-144114-6',' literature ','shelf a'],['Other Book','','','9780141441147','Literatuer','Shefl A']]
 const original = structuredClone(rows), mapping = { ...detectMapping('Books', rows), categoryId: 99, location: 'Unrelated default' }
 const references = { categories: [{ id: 1, name: 'Literature', status: 'Active' }], locations: [{ id: 2, name: 'Shelf A', status: 'Active' }] }
 const parsed = mappedRows([{ name: 'Books', rows, mapping, headers: rows[0] }], [mapping], references)
 assert.deepEqual(rows, original); assert.deepEqual(parsed.items[0].source, original[1])
 const first = parsed.items[0].data
 assert.equal(first.title, 'Jane Eyre'); assert.equal(first.copies, '2'); assert.equal(first.isbn, '9780141441146')
 assert.equal(first.categoryId, 1); assert.equal(first.location, 'Shelf A')
 assert.equal(validateHoldingsData(first).length, 0)
 assert.ok(first.autoCorrections?.some(change => change.field === 'copies' && change.before === '002.00' && change.after === '2'))
 assert.ok(first.autoCorrections?.some(change => change.reason === 'category' && change.after === 'Literature'))
 assert.deepEqual(first.autoCorrections?.filter(change => change.field === 'categoryName'), [{ field: 'categoryName', before: ' literature ', after: 'Literature', reason: 'category' }])
 const second = parsed.items[1].data
 assert.equal(second.categoryId, null); assert.equal(second.location, '')
 assert.equal(second.author, ''); assert.equal(second.copies, '')
 const errors = validateHoldingsData(second)
 for (const fragment of ['Author', 'Copies', 'ISBN', 'category', 'shelf']) assert.ok(errors.some(error => error.toLowerCase().includes(fragment.toLowerCase())), fragment)
})

test('ambiguous quantity headings need a choice and number expressions stay invalid', () => {
 assert.equal(detectMapping('Books', [['Title','Author','Copies','Quantity']]).columns.copies, undefined)
 const rows = [['Title','Author','Copies'],['Book','Writer','1e2']], mapping = { ...detectMapping('Books', rows), categoryId: 1, location: 'Shelf A' }
 const item = mappedRows([{ name: 'Books', rows, mapping, headers: rows[0] }], [mapping]).items[0]
 assert.ok(validateHoldingsData(item.data).some(error => error.includes('Copies')))
})

test('legacy mapping fingerprints remain identical while new mapped references are distinct', () => {
 const legacyFields = ['title','author','isbn','edition','publisher','publicationYear','copyrightYear','pages','copies','missingCopies','accessions','barcodes','callNumber']
 const mappings = [detectMapping('Z', [['Title','Author','Copies']]), detectMapping('A', [['Title','Author','Copies']])]
 const oldIdentity = JSON.stringify(mappings.map(mapping => ({ ...mapping, columns: Object.fromEntries(legacyFields.map(field => [field, mapping.columns[field as keyof typeof mapping.columns] ?? null])) })).sort((a, b) => a.sheet.localeCompare(b.sheet)))
 assert.equal(holdingsMappingIdentity(mappings), oldIdentity)
 assert.notEqual(holdingsMappingIdentity(mappings.map(mapping => ({ ...mapping, columns: { ...mapping.columns, categoryName: 4 } }))), oldIdentity)
})
