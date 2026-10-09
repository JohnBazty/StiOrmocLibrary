/** Map fetch / API failures to plain-language messages for portal UI. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message))) {
    return 'Check your internet connection and try again.'
  }
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim()
    if (/^error\s*5\d\d$/i.test(message) || /internal server error/i.test(message)) {
      return 'Something went wrong on our side. Try again in a moment, or visit the library desk if it continues.'
    }
    return message
  }
  return fallback
}

export function throwApiError(response: Response, payload: { message?: string; code?: string } | null, fallback: string): never {
  if (!response.ok && response.status >= 500) {
    throw new Error(payload?.message?.trim() || 'Something went wrong on our side. Try again in a moment, or visit the library desk if it continues.')
  }
  if (!response.ok && response.status === 0) {
    throw new Error('Check your internet connection and try again.')
  }
  throw new Error(payload?.message?.trim() || fallback)
}
