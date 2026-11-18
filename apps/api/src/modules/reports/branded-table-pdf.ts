import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'
import { SYSTEM_NAME } from '../../config/branding.ts'

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
  fonts?: { regular: string; bold: string }
}

/** Creates a paginated A3 landscape report containing one complete bordered table. */
export function createBrandedTablePdf<Row extends object>(rows: AsyncIterable<Row>, options: PdfTableOptions<Row>) {
  const document = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 32, bufferPages: false })
  const fonts=options.fonts??{
    regular:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),
    bold:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Bold.ttf',import.meta.url)),
  }
  document.registerFont('ReportRegular', fonts.regular)
  document.registerFont('ReportBold', fonts.bold)
  const regular = 'ReportRegular'
  const bold = 'ReportBold'
  const pageMargin = 32
  const bottom = document.page.height - 40
  const tableWidth = document.page.width - pageMargin * 2
  const requestedWidth = options.columns.reduce((sum, column) => sum + column.width, 0)
  if (!options.columns.length || requestedWidth <= 0) throw new Error('A report needs at least one visible column.')
  const scale = tableWidth / requestedWidth
  const columns = options.columns.map((column) => ({ ...column, width: column.width * scale }))
  const fontSize = 7
  document.font(regular).fontSize(fontSize)
  const lineHeight = document.currentLineHeight(true) + 1
  document.font(regular).fontSize(7)
  const bannerHeight = Math.max(66, 54 + document.heightOfString(options.subtitle, { width: tableWidth, lineGap: 1 }) + 10)
  const tableTop = bannerHeight + 16
  document.font(bold).fontSize(fontSize)
  const headerHeight = Math.max(30,...columns.map(column=>document.heightOfString(column.label,{width:column.width-8})+14))
  if(tableTop+headerHeight+25>bottom)throw new Error('The report heading is too long. Narrow the report criteria.')
  let pageNumber = 0
  let rowIndex = 0

  function pageHeader() {
    pageNumber += 1
    document.rect(0, 0, document.page.width, bannerHeight).fill(BLUE)
    document.fillColor(WHITE).fontSize(11.5).font(bold).text(SYSTEM_NAME, pageMargin, 14, {
      width: tableWidth - 92, lineBreak: false,
    })
    document.fillColor(YELLOW).fontSize(9).text(options.title, pageMargin, 36, {width:tableWidth})
    document.fillColor(WHITE).font(regular).fontSize(7).text(options.subtitle, pageMargin, 54, {width:tableWidth,lineGap:1})
    document.fillColor(YELLOW).font(bold).fontSize(7).text(`PAGE ${pageNumber}`, document.page.width - 110, 27, {
      width: 78, align: 'right', lineBreak: false,
    })
    document.rect(pageMargin, tableTop, tableWidth, headerHeight).fill(YELLOW)
    document.rect(pageMargin, tableTop, tableWidth, headerHeight).lineWidth(0.8).strokeColor(BLUE).stroke()
    let x = pageMargin
    document.fillColor(BLUE).font(bold).fontSize(fontSize)
    for (const column of columns) {
      document.text(column.label, x + 4, tableTop + 7, { width: column.width - 8, height: headerHeight - 10 })
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

  // Wrap by measured glyph width, including long words. Each resulting line is
  // rendered once; oversized rows continue on the next page instead of clipping.
  function wrap(text: string, width: number) {
    document.font(regular).fontSize(fontSize)
    const lines:string[]=[]
    for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')) {
      let line=''
      for(const word of paragraph.split(/\s+/u)) {
        if(!word)continue
        const candidate=line?`${line} ${word}`:word
        if(document.widthOfString(candidate)<=width){line=candidate;continue}
        if(line){lines.push(line);line=''}
        for(const character of word){
          if(line && document.widthOfString(line+character)>width){lines.push(line);line=''}
          line+=character
        }
      }
      lines.push(line)
    }
    return lines
  }

  function drawRow(cells: string[][], y: number, height: number) {
    document.save()
    document.fillOpacity(rowIndex % 2 === 0 ? 1 : 0.12)
    document.rect(pageMargin, y, tableWidth, height).fill(rowIndex % 2 === 0 ? WHITE : YELLOW)
    document.restore()
    document.rect(pageMargin, y, tableWidth, height).lineWidth(0.5).strokeColor(BLUE).strokeOpacity(0.35).stroke().strokeOpacity(1)
    let x = pageMargin
    document.fillColor(BLUE).font(regular).fontSize(fontSize)
    columns.forEach((column,index)=>{
      cells[index].forEach((line,lineIndex)=>document.text(line,x+4,y+5+lineIndex*lineHeight,{width:column.width-8,lineBreak:false}))
      x += column.width
      document.moveTo(x, y).lineTo(x, y + height).lineWidth(0.35).strokeColor(BLUE).strokeOpacity(0.25).stroke().strokeOpacity(1)
    })
  }

  async function render() {
    pageHeader()
    let y = tableTop + headerHeight
    const newPage=()=>{document.addPage();pageHeader();y=tableTop+headerHeight}
    for await (const row of rows) {
      const cells=columns.map(column=>wrap(valueFor(row,column),column.width-8))
      const lines=Math.max(...cells.map(cell=>cell.length))
      const wholeHeight=Math.max(25,lines*lineHeight+10)
      const pageCapacity=bottom-tableTop-headerHeight
      if(wholeHeight<=pageCapacity && y+wholeHeight>bottom)newPage()
      let offset=0
      while(offset<lines){
        const continuation=offset>0
        const markerHeight=continuation?14:0
        const available=bottom-y-markerHeight-10
        if(available<lineHeight){newPage();continue}
        const count=Math.min(lines-offset,Math.floor(available/lineHeight))
        if(continuation){
          document.fillColor(BLUE).font(bold).fontSize(7).text('Record continued from previous page',pageMargin+4,y+2,{lineBreak:false})
          y+=markerHeight
        }
        const height=Math.max(25,count*lineHeight+10)
        if(y+height>bottom){newPage();continue}
        drawRow(cells.map(cell=>cell.slice(offset,offset+count)),y,height)
        y+=height
        offset+=count
        if(offset<lines)newPage()
      }
      rowIndex += 1
    }
    if (rowIndex === 0) {
      document.rect(pageMargin, y, tableWidth, 44).lineWidth(0.5).strokeColor(BLUE).strokeOpacity(0.35).stroke().strokeOpacity(1)
      document.fillColor(BLUE).font(bold).fontSize(9).text(options.emptyMessage, pageMargin + 8, y + 16, { width: tableWidth - 16, align: 'center' })
    }
    document.end()
  }
  void render().catch((error) => document.destroy(error))
  return document
}
