import PDFDocument from 'pdfkit'

const BLUE = '#003399'
const YELLOW = '#FFF200'
const WHITE = '#FFFFFF'

export type PdfTableColumn<Row> = {
  key: keyof Row
  label: string
  width: number
  format?: (value: Row[keyof Row], row: Row) => string
}

type PdfTableOptions<Row> = {
  title: string
  subtitle: string
  emptyMessage: string
  columns: Array<PdfTableColumn<Row>>
}

/** Creates a paginated A3 landscape report containing one complete bordered table. */
export function createBrandedTablePdf<Row extends object>(rows: AsyncIterable<Row>, options: PdfTableOptions<Row>) {
  const document = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 32, bufferPages: false })
  const pageMargin = 32
  const tableTop = 86
  const headerHeight = 30
  const bottom = document.page.height - 40
  const tableWidth = document.page.width - pageMargin * 2
  const requestedWidth = options.columns.reduce((sum, column) => sum + column.width, 0)
  const scale = tableWidth / requestedWidth
  const columns = options.columns.map((column) => ({ ...column, width: column.width * scale }))
  let pageNumber = 0
  let rowIndex = 0

  function pageHeader() {
    pageNumber += 1
    document.rect(0, 0, document.page.width, 66).fill(BLUE)
    document.fillColor(WHITE).fontSize(17).font('Helvetica-Bold').text('STI ORMOC SMART LIBRARY', pageMargin, 17)
    document.fillColor(YELLOW).fontSize(9).text(options.title, pageMargin, 37)
    document.fillColor(WHITE).font('Helvetica').fontSize(6.5).text(options.subtitle, pageMargin, 51)
    document.fillColor(YELLOW).font('Helvetica-Bold').fontSize(7).text(`PAGE ${pageNumber}`, document.page.width - 110, 27, {
      width: 78, align: 'right', lineBreak: false,
    })

    document.rect(pageMargin, tableTop, tableWidth, headerHeight).fill(YELLOW)
    document.rect(pageMargin, tableTop, tableWidth, headerHeight).lineWidth(0.8).strokeColor(BLUE).stroke()
    let x = pageMargin
    document.fillColor(BLUE).font('Helvetica-Bold').fontSize(6.5)
    for (const column of columns) {
      document.text(column.label, x + 4, tableTop + 8, { width: column.width - 8, height: headerHeight - 10, align: 'left' })
      x += column.width
      document.moveTo(x, tableTop).lineTo(x, tableTop + headerHeight).lineWidth(0.45).strokeColor(BLUE).stroke()
    }
    // Explicitly restore the flow cursor after drawing the fixed-position footer.
    document.x = pageMargin
    document.y = tableTop + headerHeight
  }

  function valueFor(row: Row, column: (typeof columns)[number]) {
    const value = row[column.key]
    return column.format ? column.format(value, row) : String(value ?? '')
  }

  function rowHeight(row: Row) {
    document.font('Helvetica').fontSize(6.5)
    return Math.max(25, ...columns.map((column) => (
      document.heightOfString(valueFor(row, column), { width: column.width - 8, lineGap: 1 }) + 10
    )))
  }

  function drawRow(row: Row, y: number, height: number) {
    document.save()
    document.fillOpacity(rowIndex % 2 === 0 ? 1 : 0.12)
    document.rect(pageMargin, y, tableWidth, height).fill(rowIndex % 2 === 0 ? WHITE : YELLOW)
    document.restore()
    document.rect(pageMargin, y, tableWidth, height).lineWidth(0.5).strokeColor(BLUE).strokeOpacity(0.35).stroke().strokeOpacity(1)

    let x = pageMargin
    document.fillColor(BLUE).font('Helvetica').fontSize(6.5)
    for (const column of columns) {
      document.text(valueFor(row, column), x + 4, y + 5, { width: column.width - 8, height: height - 8, lineGap: 1 })
      x += column.width
      document.moveTo(x, y).lineTo(x, y + height).lineWidth(0.35).strokeColor(BLUE).strokeOpacity(0.25).stroke().strokeOpacity(1)
    }
  }

  async function render() {
    pageHeader()
    let y = tableTop + headerHeight
    for await (const row of rows) {
      let height = rowHeight(row)
      if (height > bottom - tableTop - headerHeight) height = bottom - tableTop - headerHeight
      if (y + height > bottom) {
        document.addPage()
        pageHeader()
        y = tableTop + headerHeight
      }
      drawRow(row, y, height)
      y += height
      rowIndex += 1
    }

    if (rowIndex === 0) {
      const height = 44
      document.rect(pageMargin, y, tableWidth, height).lineWidth(0.5).strokeColor(BLUE).strokeOpacity(0.35).stroke().strokeOpacity(1)
      document.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text(options.emptyMessage, pageMargin + 8, y + 16, { width: tableWidth - 16, align: 'center' })
    }
    document.end()
  }

  void render().catch((error) => document.destroy(error))
  return document
}
