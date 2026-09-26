import bcrypt from 'bcrypt'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { ALL_ROLES, dashboardForRole, webDashboardForRole } from './auth.constants.js'
import { createCsrfToken, sessionCookie } from './auth.middleware.js'
import { validateLoginInput } from './auth.validation.js'

const DUMMY_BCRYPT_HASH = '$2b$12$k1Pc4Uvw2o.7wwBZ1hQwHu5vTfEfRPRgRhhcaawYWpPJez0o7gaCq'
const DEACTIVATED_MESSAGE = 'Your account is currently deactivated. Please coordinate with the campus librarian.'

function regenerateSession(request) {
  return new Promise((resolve, reject) => request.session.regenerate((error) => (error ? reject(error) : resolve())))
}

function saveSession(request) {
  return new Promise((resolve, reject) => request.session.save((error) => (error ? reject(error) : resolve())))
}

export function createLoginController({ database = db, passwordHasher = bcrypt } = {}) {
  return async function login(request, response, next) {
    try {
      const validation = validateLoginInput(request.body)
      if (!validation.isValid) {
        return response.status(422).json({ success: false, code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', errors: validation.errors })
      }

      const [rows] = await database.execute(
        `SELECT u.user_id, u.full_name, u.email, u.password_hash, u.account_status, u.auth_version,
                a.account_status AS linked_status, r.role_name
         FROM users AS u
         INNER JOIN roles AS r ON r.role_id = u.role_id
         LEFT JOIN accounts a ON a.user_id=u.user_id
         WHERE u.email = ?
         LIMIT 1`,
        [validation.email],
      )

      const user = Array.isArray(rows) ? rows[0] : null
      const passwordMatches = await passwordHasher.compare(validation.password, user?.password_hash ?? DUMMY_BCRYPT_HASH)

      if (!user || !passwordMatches) {
        return response.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'The email address or password is incorrect.' })
      }

      if (user.account_status !== 'Active' || (user.linked_status && user.linked_status !== 'Active')) {
        return response.status(403).json({ success: false, code: 'ACCOUNT_DEACTIVATED', message: DEACTIVATED_MESSAGE })
      }

      if (!ALL_ROLES.includes(user.role_name)) {
        return response.status(403).json({ success: false, code: 'ROLE_NOT_AUTHORIZED', message: 'Your assigned role is not authorized to access this system.' })
      }

      await regenerateSession(request)
      request.session.user = {
        id: Number(user.user_id),
        fullName: user.full_name,
        email: user.email,
        role: user.role_name,
      }
      request.session.lastActivity = Date.now()
      request.session.authVersion = Number(user.auth_version ?? 1)
      request.session.csrfToken = createCsrfToken()
      await saveSession(request)

      return response.json({
        success: true,
        message: 'Login successful.',
        redirect: new URL(webDashboardForRole(user.role_name), env.webOrigin).toString(),
        user: request.session.user,
      })
    } catch (error) {
      next(error)
    }
  }
}

export const login = createLoginController()

export function csrf(request, response) {
  response.set('Cache-Control', 'no-store')
  response.json({ success: true, csrfToken: request.session.csrfToken })
}

export function currentUser(request, response) {
  response.set('Cache-Control', 'no-store')
  response.json({ success: true, user: request.session.user, redirect: dashboardForRole(request.session.user.role) })
}

export function logout(request, response, next) {
  request.session.destroy((error) => {
    if (error) return next(error)
    response.clearCookie(env.session.name, {
      httpOnly: sessionCookie.httpOnly,
      secure: sessionCookie.secure,
      sameSite: sessionCookie.sameSite,
      path: sessionCookie.path,
    })
    return response.redirect(303, '/login?logout=1')
  })
}
