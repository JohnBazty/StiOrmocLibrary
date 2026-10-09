import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { jwtAuthService } from './jwt-auth.service.ts'
import { authenticateJwt, requireJwtRoles } from './jwt-auth.middleware.ts'
import { passwordResetService } from './password-reset.service.ts'

type AuthService = typeof jwtAuthService
type ResetService = typeof passwordResetService

export function createJwtLoginController(service: AuthService = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { response.json({ success: true, message: 'Login successful.', data: await service.login(request.body) }) }
    catch (error) { next(error) }
  }
}

export function createJwtRegisterController(service: AuthService = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await service.register(request.body)
      response.status(201).json({ success: true, message: 'Account created successfully!', data })
    } catch (error) { next(error) }
  }
}

export function createPasswordResetRequestController(service: ResetService = passwordResetService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await service.requestReset(request.body)
      response.json({ success: true, message: data.message, data })
    } catch (error) { next(error) }
  }
}

export function createPasswordResetVerifyController(service: ResetService = passwordResetService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await service.verifyOtp(request.body)
      response.json({ success: true, message: 'Reset code verified.', data })
    } catch (error) { next(error) }
  }
}

export function createPasswordResetConfirmController(service: ResetService = passwordResetService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await service.confirmReset(request.body)
      response.json({ success: true, message: data.message, data })
    } catch (error) { next(error) }
  }
}

const limiter = rateLimit({
  // Keep production tight; local QA / browser retries burn the 8-attempt budget quickly.
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 8 : 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please wait 15 minutes and try again.' },
})

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REGISTRATIONS', message: 'Too many registration attempts. Please try again later.' },
})

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_RESET_ATTEMPTS', message: 'Too many password reset attempts. Please wait 15 minutes and try again.' },
})

export const jwtAuthRouter = Router()
jwtAuthRouter.post('/register', registrationLimiter, createJwtRegisterController())
jwtAuthRouter.post('/login', limiter, createJwtLoginController())
jwtAuthRouter.post('/password-reset/request', passwordResetLimiter, createPasswordResetRequestController())
jwtAuthRouter.post('/password-reset/verify', passwordResetLimiter, createPasswordResetVerifyController())
jwtAuthRouter.post('/password-reset/confirm', passwordResetLimiter, createPasswordResetConfirmController())
jwtAuthRouter.get('/me', authenticateJwt, (_request, response) => response.json({ success: true, data: response.locals.authenticatedUser }))

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
