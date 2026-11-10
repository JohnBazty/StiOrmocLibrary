import { getAccessToken } from '../auth/auth-storage'

export type BorrowRequestReceipt = {
  requestGroupId: string
  status: 'pending_claim' | 'preparing' | 'queued'
  instructions: string
  items: Array<{ transactionId: number|null; reservationId?:number; statusLabel?:string; titleId: number; title: string; physicalCopyId: number|null; accessionNumber: string; barcode: string }>
}

export class BookCartApiError extends Error {
  constructor(message: string, public code: string, public details?: unknown) { super(message) }
}

export async function fetchCartState():Promise<{activeTitleIds:number[]}> {
  const token=getAccessToken()
  const response=await fetch('/api/v1/borrow/cart-state',{credentials:'include',headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}})
  const payload=await response.json().catch(()=>null)
  if(!response.ok||!payload?.success||!Array.isArray(payload.data?.activeTitleIds)||!payload.data.activeTitleIds.every((id:unknown)=>Number.isSafeInteger(id)&&Number(id)>0))throw new Error('Current book requests and loans could not be checked.')
  return payload.data
}

export async function submitBorrowRequest(titleIds: number[],requestId?:string) {
  const token = getAccessToken()
  const response = await fetch('/api/v1/borrow/submit-request', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title_ids: titleIds,requestId }),
  })
  const payload = await response.json().catch(() => null) as {
    success?: boolean; code?: string; message?: string; details?: unknown; data?: BorrowRequestReceipt
  } | null
  if (!response.ok || !payload?.success || !payload.data) {
    throw new BookCartApiError(payload?.message ?? 'The borrow request could not be submitted.', payload?.code ?? 'BORROW_REQUEST_FAILED', payload?.details)
  }
  return payload.data
}
