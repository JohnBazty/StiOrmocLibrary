import type { NextFunction, Request, Response } from 'express'
import { validateBorrowCart, type BorrowCartInput } from './circulation.validation.ts'

declare global {
  namespace Express {
    interface Locals {
      borrowCart?: BorrowCartInput
    }
  }
}

/** Reject malformed cart bodies before a database transaction is opened. */
export function validateBorrowCartBody(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.borrowCart = validateBorrowCart(request.body)
    next()
  } catch (error) {
    next(error)
  }
}
