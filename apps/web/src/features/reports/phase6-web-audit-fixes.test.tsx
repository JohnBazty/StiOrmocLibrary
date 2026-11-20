import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadPaymentRecord, type Payment } from '../payments/payments-api'
import { AdminAuditLogsPage, escapeCsv } from './AdminAuditLogsPage'
import { escapeCsvCell } from '../catalog/CatalogManagementPage'

describe('Phase 6 Web Audit Fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('HIGH-09: downloadPaymentRecord routes Service Charge (Other) receipts to service-charges/receipts/:id/pdf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    const payment: Payment = {
      paymentId: 'pay-other-12345678',
      kind: 'Other',
      targetId: 42,
      channelCode: 'GCASH',
      principalCentavos: 5000,
      feeCentavos: 150,
      totalCentavos: 5150,
      remainingCentavos: 0,
      isSample: false,
      checkoutUrl: null,
      state: 'Succeeded',
      createdAt: '2026-11-20T00:00:00.000Z',
      expiresAt: '2026-11-20T01:00:00.000Z',
      receiptId: 99,
    }

    await downloadPaymentRecord(payment, false)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/service-charges/receipts/99/pdf',
      expect.objectContaining({ credentials: 'include' }),
    )

    await downloadPaymentRecord(payment, true)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/admin/service-charges/receipts/99/pdf',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(createObjectUrlSpy).toHaveBeenCalled()
  })

  it('HIGH-08: AdminAuditLogsPage surfaces HTTP 403/500 error in NoticeBanner instead of silently rendering 0 events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'You do not have permission to view audit logs.' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<AdminAuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText(/You do not have permission to view audit logs/i)).toBeTruthy()
    })
  })

  it('LOW-01: escapeCsv and escapeCsvCell neutralize spreadsheet formula prefixes (=, +, -, @)', () => {
    expect(escapeCsv('=CMD()')).toBe("'=CMD()")
    expect(escapeCsv('+1+1')).toBe("'+1+1")
    expect(escapeCsv('-2+3')).toBe("'-2+3")
    expect(escapeCsv('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)")
    expect(escapeCsvCell('=HYPERLINK("http://evil.invalid")')).toBe('\'"\'=HYPERLINK(""http://evil.invalid"")"'.startsWith('\'"') ? "\"'=HYPERLINK(\"\"http://evil.invalid\"\")\"" : "'=HYPERLINK(\"http://evil.invalid\")")
    expect(escapeCsvCell('Normal Title')).toBe('Normal Title')
  })
})
