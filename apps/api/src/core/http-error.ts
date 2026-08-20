export type HttpErrorDetails = Record<string, unknown>

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: HttpErrorDetails

  constructor(status: number, code: string, message: string, details?: HttpErrorDetails) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

