import { expect, it } from 'vitest'
import JSZip from 'jszip'
import { checkOfficeArchive, csvPreview, officePreview } from './file-preview-reader'

async function fileFrom(parts: Record<string, string>, name: string) {
  const zip = new JSZip()
  for (const [path, value] of Object.entries(parts)) zip.file(path, value)
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], name)
}
it('keeps quoted commas, escaped quotes, multiline cells and school IDs intact in CSV samples', () => {
  const [sheet] = csvPreview('ID,Title,Notes\r\n02000351061,"First, book","Line one\nLine ""two"""\r\n')
  expect(sheet.rows[1]).toEqual(['02000351061', 'First, book', 'Line one\nLine "two"'])
  expect(csvPreview('Title;Copies\nBook;2')[0].rows[1]).toEqual(['Book', '2'])
  expect(csvPreview('Title\tCopies\nBook\t2')[0].rows[1]).toEqual(['Book', '2'])
})
it('bounds CSV samples and treats formulas as text', () => {
  const [sheet] = csvPreview(Array.from({ length: 60 }, () => Array.from({ length: 40 }, () => '=HYPERLINK("https://example.invalid")').join(';')).join('\n'))
  expect(sheet.rows).toHaveLength(30)
  expect(sheet.rows.every(row => row.length <= 24)).toBe(true)
  expect(sheet.rows[0][0]).toContain('=HYPERLINK')
})
it('extracts Word text without rendering fields, markup or external relationships', async () => {
  const file = await fileFrom({
    'word/document.xml': '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Preview &lt;script&gt; text</w:t></w:r></w:p><w:p><w:r><w:instrText>INCLUDEPICTURE https://example.invalid</w:instrText></w:r></w:p></w:body></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship TargetMode="External" Target="https://example.invalid" /></Relationships>',
  }, 'book.docx')
  expect(await officePreview(file)).toEqual({ kind: 'document', paragraphs: ['Preview <script> text'], images: [] })
})
it('reads XLSX shared and inline strings, sparse cells and saved formula values across sheets', async () => {
  const file = await fileFrom({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Books" r:id="r1"/><sheet name="More books" r:id="r2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Book title</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>02000351061</t></is></c><c r="D1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Other title</t></is></c></row></sheetData></worksheet>',
  }, 'books.xlsx')
  expect(await officePreview(file)).toEqual({ kind: 'spreadsheet', sheets: [{ name: 'Books', rows: [['Book title', '', '02000351061', '2']] }, { name: 'More books', rows: [['Other title']] }] })
})
it('rejects malformed XML, damaged archives and declared expansion beyond preview limits', async () => {
  await expect(officePreview(new File(['broken'], 'bad.docx'))).rejects.toThrow()
  const file = await fileFrom({ 'word/document.xml': '<broken' }, 'bad.docx')
  await expect(officePreview(file)).rejects.toThrow()
  const zip = new JSZip(); zip.file('word/document.xml', '<document/>')
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  const view = new DataView(buffer)
  for (let i = 0; i < buffer.byteLength - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 40 * 1024 * 1024, true); break }
  }
  expect(() => checkOfficeArchive(buffer)).toThrow(/too complex/)
})
