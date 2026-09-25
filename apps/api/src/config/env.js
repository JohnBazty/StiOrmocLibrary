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
const configuredAttendanceQrSecret = process.env.ATTENDANCE_QR_SECRET?.trim()

if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production.')
}
if (isProduction && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production.')
}
if (isProduction && (!configuredReportIntegritySecret || configuredReportIntegritySecret.length < 32)) {
  throw new Error('REPORT_INTEGRITY_SECRET must contain at least 32 characters in production.')
}
if (isProduction && (!configuredAttendanceQrSecret || configuredAttendanceQrSecret.length < 32)) {
  throw new Error('ATTENDANCE_QR_SECRET must contain at least 32 characters in production.')
}

const developmentJwtSecret = configuredJwtSecret || configuredSecret || randomBytes(48).toString('hex')

function resolveDatabaseUrl() {
  // Unit tests assert MySQL SQL shapes; force local MySQL dialect when set.
  if (process.env.DB_FORCE_MYSQL === '1' || process.env.DB_FORCE_MYSQL === 'true') {
    return ''
  }

  const explicit = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() || ''
  if (explicit.startsWith('postgres')) return explicit

  // Build from Supabase project URL + DB password when DATABASE_URL is omitted.
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || ''
  const dbPass = process.env.DB_PASS?.trim() || process.env.SUPABASE_DB_PASSWORD?.trim() || ''
  const hostMatch = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)
  if (hostMatch && dbPass) {
    const projectRef = hostMatch[1]
    const encoded = encodeURIComponent(dbPass)
    const region = process.env.SUPABASE_REGION?.trim()
    // Prefer IPv4 session pooler when region is known (direct db.* is often IPv6-only).
    if (region) {
      return `postgresql://postgres.${projectRef}:${encoded}@aws-0-${region}.pooler.supabase.com:5432/postgres`
    }
    return `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`
  }
  return ''
}

const databaseUrl = resolveDatabaseUrl()
const dbDriver = databaseUrl.startsWith('postgres') ? 'postgres' : 'mysql'

export const env = Object.freeze({
  isProduction,
  inventoryPreviewEnabled: !isProduction && process.env.INVENTORY_PREVIEW_ENABLED === 'true',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  supabase: {
    url: process.env.SUPABASE_URL?.trim() || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
    secretKey: process.env.SUPABASE_SECRET_KEY?.trim() || '',
    jwksUrl: process.env.SUPABASE_JWKS_URL?.trim() || '',
  },
  db: {
    driver: dbDriver,
    connectionString: databaseUrl,
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
  attendanceQr: {
    // Keep this key stable. Rotating it invalidates downloaded attendance passes.
    secret: configuredAttendanceQrSecret || configuredReportIntegritySecret || developmentJwtSecret,
  },
  isbnLookup: {
    timeoutMs: Math.max(500, Math.min(10000, Number(process.env.ISBN_LOOKUP_TIMEOUT_MS ?? 3500))),
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() ?? '',
  },
})
