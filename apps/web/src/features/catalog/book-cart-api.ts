import { getAccessToken } from '../auth/auth-storage'

export type BorrowRequestReceipt = {
  requestGroupId: string
  status: 'pending_claim'
  instructions: string
  items: Array<{ transactionId: number; titleId: number; title: string; physicalCopyId: number; accessionNumber: string; barcode: string }>
}

export class BookCartApiError extends Error {
  constructor(message: string, public code: string, public details?: unknown) { super(message) }
}

export async function submitBorrowRequest(titleIds: number[]) {
  const token = getAccessToken()
  const response = await fetch('/api/v1/borrow/submit-request', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title_ids: titleIds }),
  })
  const payload = await response.json().catch(() => null) as {
    success?: boolean; code?: string; message?: string; details?: unknown; data?: BorrowRequestReceipt
  } | null
  if (!response.ok || !payload?.success || !payload.data) {
    throw new BookCartApiError(payload?.message ?? 'The borrow request could not be submitted.', payload?.code ?? 'BORROW_REQUEST_FAILED', payload?.details)
  }
  return payload.data
}
