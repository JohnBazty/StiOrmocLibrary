import { Router, type Request } from 'express'
import { createCsrfToken } from '../auth/auth.middleware.js'
import { env } from '../../config/env.js'

export const inventoryPreviewRouter = Router()

function isLoopback(request: Request) {
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

inventoryPreviewRouter.post('/session', (request, response, next) => {
  if (!env.inventoryPreviewEnabled || env.isProduction) return response.status(404).json({ success: false, message: 'Route not found.' })
  const origin = request.get('origin')
  if (!isLoopback(request) || (origin && origin !== env.webOrigin)) {
    return response.status(403).json({ success: false, code: 'INVENTORY_PREVIEW_FORBIDDEN', message: 'Inventory preview is available only from the configured local web application.' })
  }
  return request.session.regenerate((error) => {
    if (error) return next(error)
    request.session.user = {
      id: null,
      fullName: 'admin_authenticated',
      email: '',
      role: 'System Administrator',
    }
    request.session.csrfToken = createCsrfToken()
    request.session.lastActivity = Date.now()
    return request.session.save((saveError) => {
      if (saveError) return next(saveError)
      return response.json({
        success: true,
        data: {
          session: { user_id: null, username: 'admin_authenticated', role: 'Admin', school_id: '' },
          csrf_token: request.session.csrfToken,
        },
      })
    })
  })
})
