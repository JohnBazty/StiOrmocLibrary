import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { jwtAuthService } from './jwt-auth.service.ts'
import { authenticateJwt, requireJwtRoles } from './jwt-auth.middleware.ts'

type Service = typeof jwtAuthService
export function createJwtLoginController(service: Service = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { response.json({ success: true, message: 'Login successful.', data: await service.login(request.body) }) }
    catch (error) { next(error) }
  }
}

export function createJwtRegisterController(service: Service = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await service.register(request.body)
      response.status(201).json({ success: true, message: 'Account created successfully!', data })
    } catch (error) { next(error) }
  }
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please wait 15 minutes.' },
})

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REGISTRATIONS', message: 'Too many registration attempts. Please try again later.' },
})

export const jwtAuthRouter = Router()
jwtAuthRouter.post('/register', registrationLimiter, createJwtRegisterController())
jwtAuthRouter.post('/login', limiter, createJwtLoginController())
jwtAuthRouter.get('/me', authenticateJwt, (_request, response) => response.json({ success: true, data: response.locals.authenticatedUser }))

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
