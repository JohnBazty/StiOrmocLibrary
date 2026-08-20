import 'express-session'

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number | null
      fullName: string
      email: string
      role: string
    }
    csrfToken?: string
    lastActivity?: number
  }
}
