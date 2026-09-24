import PDFDocument from 'pdfkit'

export type PrintingReceipt = {
  print_receipt_id: number
  request_id: number
  receipt_number: string
  verification_code: string
  receipt_status: 'Issued' | 'Reversed'
  student_name: string
  school_id: string
  file_name: string
  page_count: number
  number_of_copies: number
  total_sheets: number
  print_type: string
  paper_size: string
  amount_received: number
  payment_method: string
  received_by: string
  received_at: unknown
}

function money(value: number) { return `PHP ${Number(value).toFixed(2)}` }
function timestamp(value: unknown) {
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

export function createPrintingReceiptPdf(receipt: PrintingReceipt) {
  const document = new PDFDocument({ size: 'A4', margin: 42 })
  const blue = '#003399'; const yellow = '#FFF200'; const white = '#FFFFFF'; const width = document.page.width - 84

  document.rect(0, 0, document.page.width, 94).fill(blue)
  document.fillColor(white).font('Helvetica-Bold').fontSize(19).text('STI ORMOC SMART LIBRARY', 42, 25)
  document.fillColor(yellow).fontSize(10).text('OFFICIAL PRINTING SERVICE RECEIPT', 42, 53)
  document.fillColor(white).font('Helvetica').fontSize(8).text('Cash printing payment recorded by authorized library personnel', 42, 70)

  let y = 120
  document.fillColor(blue).font('Helvetica-Bold').fontSize(15).text(receipt.receipt_number, 42, y)
  document.roundedRect(document.page.width - 150, y - 4, 108, 26, 8).fill(receipt.receipt_status === 'Reversed' ? yellow : white).strokeColor(blue).stroke()
  document.fillColor(blue).fontSize(9).text(receipt.receipt_status.toUpperCase(), document.page.width - 146, y + 4, { width: 100, align: 'center' })
  y += 42

  const details: Array<[string,string]> = [
    ['User', receipt.student_name], ['School ID', receipt.school_id],
    ['Print request', `#${receipt.request_id}`], ['Received', timestamp(receipt.received_at)],
    ['Payment method', receipt.payment_method], ['Received by', receipt.received_by],
    ['Verification code', receipt.verification_code], ['Document', receipt.file_name],
  ]
  document.fontSize(9)
  details.forEach(([label,value],index) => {
    const column=index%2,row=Math.floor(index/2),x=42+column*(width/2)
    document.fillColor(blue).font('Helvetica-Bold').text(label.toUpperCase(),x,y+row*42,{width:width/2-12})
    document.fillColor(blue).font('Helvetica').text(value,x,y+13+row*42,{width:width/2-12,height:24,ellipsis:true})
  })
  y += 182

  const columnWidths=[105,80,70,75,75,105]
  const headers=['PRINT TYPE','PAPER','PAGES','COPIES','SHEETS','AMOUNT']
  document.rect(42,y,width,30).fill(yellow).strokeColor(blue).stroke()
  let x=42; document.fillColor(blue).font('Helvetica-Bold').fontSize(8)
  headers.forEach((header,index)=>{document.text(header,x+5,y+11,{width:columnWidths[index]-10});x+=columnWidths[index]})
  y += 30
  const values=[receipt.print_type,receipt.paper_size,String(receipt.page_count),String(receipt.number_of_copies),String(receipt.total_sheets),money(receipt.amount_received)]
  document.rect(42,y,width,42).fill(white).strokeColor(blue).strokeOpacity(0.25).stroke().strokeOpacity(1)
  x=42; document.fillColor(blue).font('Helvetica').fontSize(9)
  values.forEach((value,index)=>{document.text(value,x+5,y+14,{width:columnWidths[index]-10});x+=columnWidths[index]})
  y += 66

  document.roundedRect(document.page.width-252,y,210,58,10).fill(blue)
  document.fillColor(white).font('Helvetica').fontSize(9).text('TOTAL CASH RECEIVED',document.page.width-235,y+12,{width:175})
  document.fillColor(yellow).font('Helvetica-Bold').fontSize(18).text(money(receipt.amount_received),document.page.width-235,y+30,{width:175})

  document.moveTo(42,document.page.height-92).lineTo(document.page.width-42,document.page.height-92).strokeColor(blue).strokeOpacity(0.3).stroke().strokeOpacity(1)
  document.fillColor(blue).font('Helvetica').fontSize(8).text('This receipt belongs only to the SmartLib Printing Service. It is separate from fines, fine-payment receipts, and clearance balances.',42,document.page.height-76,{width,align:'center'})
  document.end()
  return document
}
