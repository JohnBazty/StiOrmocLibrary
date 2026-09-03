import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Resolve from this module so npm workspace and repository-root commands load
// the same API environment file consistently.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

const isProduction = process.env.NODE_ENV === 'production'
const configuredSecret = process.env.SESSION_SECRET?.trim()
const configuredJwtSecret = process.env.JWT_SECRET?.trim()
const configuredReportIntegritySecret = process.env.REPORT_INTEGRITY_SECRET?.trim()

if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production.')
}
if (isProduction && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production.')
}
if (isProduction && (!configuredReportIntegritySecret || configuredReportIntegritySecret.length < 32)) {
  throw new Error('REPORT_INTEGRITY_SECRET must contain at least 32 characters in production.')
}

const developmentJwtSecret = configuredJwtSecret || configuredSecret || randomBytes(48).toString('hex')

export const env = Object.freeze({
  isProduction,
  inventoryPreviewEnabled: !isProduction && process.env.INVENTORY_PREVIEW_ENABLED === 'true',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'sti_ormoc_library',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  },
  session: {
    name: 'sti.sid',
    secret: configuredSecret || randomBytes(48).toString('hex'),
    idleTimeoutMs: 30 * 60 * 1000,
  },
  jwt: {
    secret: developmentJwtSecret,
    issuer: process.env.JWT_ISSUER ?? 'sti-ormoc-smart-library-api',
    audience: process.env.JWT_AUDIENCE ?? 'sti-ormoc-smart-library-web',
    expiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 900),
  },
  reports: {
    // A separate production key prevents JWT key rotation from invalidating old report seals.
    integritySecret: configuredReportIntegritySecret || developmentJwtSecret,
  },
  isbnLookup: {
    timeoutMs: Math.max(500, Math.min(10000, Number(process.env.ISBN_LOOKUP_TIMEOUT_MS ?? 3500))),
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() ?? '',
  },
})
