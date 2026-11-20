import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PrintRequestForm } from './PrintRequestForm'
import { printingApi } from './printing-api'

vi.mock('./printing-api', () => ({
  printingApi: { quote: vi.fn(), submit: vi.fn() },
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const service = { accepting_requests: 1, unavailable_reason: null, max_document_mb: 4 }
const pricing = [
  { pricing_rule_id: 1, print_type: 'Monochrome' as const, paper_size: 'A4', price_per_page: 2, price_brand_stock_id: 1, paper_brand: 'PaperOne' },
  { pricing_rule_id: 2, print_type: 'Colored' as const, paper_size: 'A4', price_per_page: 5, price_brand_stock_id: 1, paper_brand: 'PaperOne' },
]

it('lets a borrower choose Pay cash at library or Pay online for photocopy requests', async () => {
  vi.mocked(printingApi.quote).mockResolvedValue({
    analysis_id: null, settings_version: 1, preview_url: null, pages: [], needs_review: true,
    pricing: { monoPages: 3, colorPages: 0, images: [], pageCount: 3, coloredPages: [], baseCentavos: 600, imageCentavos: 0, totalCentavos: 600, monoRate: 200, colorRate: 500, imageFeeMono: 0, imageFeeColor: 0, settingsVersion: 1, mode: 'Monochrome', copies: 1 },
    price_per_page: 2, paper_brand_stock_id: 1, paper_brand: 'PaperOne', page_count: 3, total_sheets: 3, calculated_cost: 6, document_sha256: '', printable_file_name: 'Photocopy originals',
  })
  vi.mocked(printingApi.submit).mockResolvedValue({} as never)

  render(<PrintRequestForm service={service} pricing={pricing} onSubmitted={async () => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Photocopy' }))
  const cashOption = screen.getByLabelText('Pay cash at library') as HTMLInputElement
  const onlineOption = screen.getByLabelText('Pay online') as HTMLInputElement
  expect(cashOption).toBeTruthy()
  expect(onlineOption).toBeTruthy()
  fireEvent.click(cashOption)

  await waitFor(() => expect(printingApi.quote).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: /Submit for page review/i }))
  await waitFor(() => expect(printingApi.submit).toHaveBeenCalled())
  const submitted = vi.mocked(printingApi.submit).mock.calls[0][0] as FormData
  expect(submitted.get('payment_method')).toBe('Cash')
})

it('shows a clear message when a selected file exceeds 4 MB', async () => {
  render(<PrintRequestForm service={service} pricing={pricing} onSubmitted={async () => {}} />)
  const input = screen.getByLabelText('Print document') as HTMLInputElement
  const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'large-thesis.pdf', { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [bigFile] } })
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toMatch(/4 MB/i)
  expect(printingApi.quote).not.toHaveBeenCalled()
})
