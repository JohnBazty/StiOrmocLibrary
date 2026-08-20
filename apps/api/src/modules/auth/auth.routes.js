import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { csrf, currentUser, login, logout, register } from './authController.js'
import { ensureCsrfToken, requireAuth, verifyCsrfToken } from './auth.middleware.js'

export const authRouter = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please wait 15 minutes and try again.' },
})

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REGISTRATIONS', message: 'Too many registration attempts. Please try again later.' },
})

authRouter.get('/csrf', ensureCsrfToken, csrf)
authRouter.post('/login', loginLimiter, verifyCsrfToken, login)
authRouter.post('/register', registrationLimiter, verifyCsrfToken, register)
authRouter.get('/me', requireAuth, currentUser)
authRouter.post('/logout', requireAuth, verifyCsrfToken, logout)

export const registrationRouter = Router()
registrationRouter.post('/', registrationLimiter, verifyCsrfToken, register)

export const logoutRouter = Router()
logoutRouter.post('/', requireAuth, verifyCsrfToken, logout)
