import { fineDate } from '../fines/fine-format'
import { paymentMoney, type Payment } from './payments-api'

function serviceLabel(kind: Payment['kind']) {
  if (kind === 'Printing') return 'Printing Service'
  if (kind === 'LostBook') return 'Lost Book Replacement'
  if (kind === 'Other') return 'Library Service Charge'
  return 'Library Fine'
}

function methodLabel(channel: string) {
  if (channel === 'GCASH') return 'GCash (Online)'
  if (channel === 'QRPH') return 'QRPh (Online)'
  return channel || 'Online Payment'
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Generates a high-resolution PNG image receipt for a succeeded payment
 * and triggers a direct image download (`library-payment-<id>.png`).
 */
export async function downloadPaymentReceiptImage(payment: Payment): Promise<void> {
  const providerRecord = payment.localPreview && payment.kind === 'Printing' && payment.state === 'Succeeded'
  if (!payment.receiptId && !providerRecord) {
    throw new Error('The payment record is not ready yet. Check its status again.')
  }

  const width = 840
  const height = 1040
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to generate the receipt image in this browser.')
  }

  // Outer light slate canvas background
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, width, height)

  // Main white receipt card
  const cardX = 48
  const cardY = 44
  const cardW = width - 96
  const cardH = height - 88
  ctx.save()
  ctx.shadowColor = 'rgba(19, 42, 63, 0.14)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 12
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // Clip to card for header banner
  ctx.save()
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24)
  ctx.clip()

  // STI Navy -> STI Blue -> Ocean Teal header gradient
  const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + 185)
  grad.addColorStop(0, '#132a3f')
  grad.addColorStop(0.6, '#0b5ea2')
  grad.addColorStop(1, '#0f766e')
  ctx.fillStyle = grad
  ctx.fillRect(cardX, cardY, cardW, 185)

  // STI Yellow top accent bar
  ctx.fillStyle = '#FFF200'
  ctx.fillRect(cardX, cardY, cardW, 8)

  // Header text
  ctx.fillStyle = '#FFF200'
  ctx.font = '700 18px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText('OFFICIAL PAYMENT RECORD', cardX + 44, cardY + 62)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 32px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText('STI College Ormoc Library', cardX + 44, cardY + 108)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = '500 18px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText('Integrated Library Management System', cardX + 44, cardY + 142)

  // Green Status Pill
  const pillY = cardY + 220
  drawRoundedRect(ctx, cardX + 44, pillY, 245, 42, 21)
  ctx.fillStyle = '#dcfce7'
  ctx.fill()
  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.arc(cardX + 70, pillY + 21, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#166534'
  ctx.font = '700 16px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText('PAYMENT SUCCESSFUL', cardX + 86, pillY + 27)

  // Total Paid highlight box
  const totalBoxY = pillY + 66
  drawRoundedRect(ctx, cardX + 44, totalBoxY, cardW - 88, 128, 16)
  ctx.fillStyle = '#f0f7ff'
  ctx.fill()
  ctx.strokeStyle = '#bae6fd'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#475569'
  ctx.font = '600 16px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText('TOTAL AMOUNT PAID', cardX + 72, totalBoxY + 42)

  ctx.fillStyle = '#0b5ea2'
  ctx.font = '800 46px Inter, system-ui, -apple-system, sans-serif'
  ctx.fillText(paymentMoney(payment.totalCentavos), cardX + 72, totalBoxY + 98)

  // Structured details rows
  const rows: Array<[string, string]> = [
    ['Service', serviceLabel(payment.kind)],
    ['Payment Amount', paymentMoney(payment.principalCentavos)],
    ['Transaction Fee', paymentMoney(payment.feeCentavos)],
    ['Payment Method', methodLabel(payment.channelCode)],
    ['Date & Time (PHT)', payment.createdAt ? fineDate(payment.createdAt) : 'Recorded'],
    ['Receipt ID', payment.receiptId ? `#${payment.receiptId}` : 'Online Record'],
    ['Reference ID', payment.paymentId],
  ]

  let rowY = totalBoxY + 168
  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i]
    ctx.fillStyle = '#64748b'
    ctx.font = '600 16px Inter, system-ui, -apple-system, sans-serif'
    ctx.fillText(label, cardX + 44, rowY)

    ctx.fillStyle = '#0f172a'
    ctx.font = label === 'Reference ID'
      ? '600 14px ui-monospace, SFMono-Regular, Menlo, monospace'
      : '700 16px Inter, system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(value, cardX + cardW - 44, rowY)
    ctx.textAlign = 'left'

    if (i < rows.length - 1) {
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cardX + 44, rowY + 18)
      ctx.lineTo(cardX + cardW - 44, rowY + 18)
      ctx.stroke()
    }
    rowY += 50
  }

  // Footer note
  const footerY = cardY + cardH - 54
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(cardX, footerY - 24, cardW, 78)
  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(cardX, footerY - 24)
  ctx.lineTo(cardX + cardW, footerY - 24)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '500 14px Inter, system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(
    'Save or attach this image as your proof of payment for library verification.',
    width / 2,
    footerY + 12,
  )
  ctx.textAlign = 'left'
  ctx.restore()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('The receipt image could not be created. Please try again.')
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `library-payment-${payment.paymentId.slice(0, 8)}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
