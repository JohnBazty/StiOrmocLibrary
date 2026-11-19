import { HttpError } from '../../core/http-error.ts'
import { centavos, paymentId } from '../payments/payments.validation.ts'

export function printBalance(assessed:unknown,paid:unknown):bigint {
  const total=centavos(assessed),received=Number(paid)===0?0n:centavos(paid)
  if(received>total)throw new HttpError(409,'PRINT_BALANCE_REVIEW_REQUIRED','This balance needs library review before another payment.')
  return total-received
}

export function parsePrintCash(body:Record<string,unknown>,balance:bigint) {
  const amount=centavos(body.amount_paid),requestKey=paymentId(body.request_key)
  if(amount>balance)throw new HttpError(409,'PRINT_PAYMENT_AMOUNT_INVALID','The cash amount cannot exceed the remaining balance. Refresh the bill.')
  const notes=String(body.notes??'').trim()
  if(notes.length>255)throw new HttpError(422,'PRINT_PAYMENT_NOTES_INVALID','Keep the payment note within 255 characters.')
  return {amount,requestKey,notes:notes||null}
}
