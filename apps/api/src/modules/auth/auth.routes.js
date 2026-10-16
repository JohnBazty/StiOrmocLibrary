import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { csrf, currentUser, login, logout } from './authController.js'
import { ensureCsrfToken, requireAuth, requireLogoutAuth, verifyCsrfToken } from './auth.middleware.js'

export const authRouter = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please wait 15 minutes and try again.' },
})

authRouter.get('/csrf', ensureCsrfToken, csrf)
// All browser logins use the OTP-capable flow; the legacy cookie route cannot bypass it.
authRouter.post('/login', loginLimiter, verifyCsrfToken, (_request, response) => response.status(409).json({ success: false, code: 'LOGIN_FLOW_UPDATED', message: 'Use the web app login to continue with school-email verification.' }))
authRouter.get('/me', requireAuth, currentUser)
authRouter.post('/logout', requireLogoutAuth, verifyCsrfToken, logout)

export const logoutRouter = Router()
logoutRouter.post('/', requireLogoutAuth, verifyCsrfToken, logout)
