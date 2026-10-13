import { Router, type Request } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { createCsrfToken } from '../auth/auth.middleware.js'
import { env } from '../../config/env.js'
import { db } from '../../config/db.js'

export const inventoryPreviewRouter = Router()

function isLoopback(request: Request) {
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

inventoryPreviewRouter.post('/session', async (request, response, next) => {
  if (!env.inventoryPreviewEnabled || env.isProduction) return response.status(404).json({ success: false, message: 'Route not found.' })
  const origin = request.get('origin')
  if (!isLoopback(request) || (origin && origin !== env.webOrigin)) {
    return response.status(403).json({ success: false, code: 'INVENTORY_PREVIEW_FORBIDDEN', message: 'Inventory preview is available only from the configured local web application.' })
  }
  try {
    const [rows] = await db.execute<RowDataPacket[]>(`
      SELECT u.user_id, u.school_id, u.full_name, u.auth_version
        FROM users u
       WHERE u.user_role = 'Admin' AND u.account_status = 'Active'
       ORDER BY u.user_id ASC
       LIMIT 1`)
    const admin = rows[0]
    if (!admin) {
      return response.status(503).json({
        success: false,
        code: 'INVENTORY_PREVIEW_NO_ADMIN',
        message: 'No active Admin user is available for inventory preview.',
      })
    }
    return request.session.regenerate((error) => {
      if (error) return next(error)
      request.session.user = {
        id: Number(admin.user_id),
        fullName: String(admin.full_name || 'admin_authenticated'),
        email: '',
        role: 'Admin',
      }
      request.session.authVersion = Number(admin.auth_version ?? 1)
      request.session.csrfToken = createCsrfToken()
      request.session.lastActivity = Date.now()
      return request.session.save((saveError) => {
        if (saveError) return next(saveError)
        return response.json({
          success: true,
          data: {
            session: {
              user_id: Number(admin.user_id),
              username: String(admin.full_name || 'admin_authenticated'),
              role: 'Admin',
              school_id: String(admin.school_id || ''),
            },
            csrf_token: request.session.csrfToken,
          },
        })
      })
    })
  } catch (error) {
    return next(error)
  }
})
