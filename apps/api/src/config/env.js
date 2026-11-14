import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readXenditSandboxConfig } from './xendit-sandbox.ts'

// Resolve from this module so npm workspace and repository-root commands load
// the same API environment file consistently.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

// Vercel reserves the TZ project variable. Normalize Node's business-calendar
// reads here; stored instants and job lease durations remain unchanged.
process.env.TZ = 'Asia/Manila'

const isProduction = process.env.NODE_ENV === 'production'
const configuredSecret = process.env.SESSION_SECRET?.trim()
const configuredJwtSecret = process.env.JWT_SECRET?.trim()
const configuredReportIntegritySecret = process.env.REPORT_INTEGRITY_SECRET?.trim()
const configuredAttendanceQrSecret = process.env.ATTENDANCE_QR_SECRET?.trim()

// Shared constants for authentication service layer
export const DUMMY_BCRYPT_HASH = '$2b$12$k1Pc4Uvw2o.7wwBZ1hQwHu5vTfEfRPRgRhhcaawYWpPJez0o7gaCq'

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

const configuredJobRunnerSecret = process.env.JOB_RUNNER_SECRET?.trim() || ''
// Unset leaves the scheduled-job route refusing every call; a set but short secret is a mistake worth failing on.
if (isProduction && configuredJobRunnerSecret && configuredJobRunnerSecret.length < 32) {
  throw new Error('JOB_RUNNER_SECRET must contain at least 32 characters in production.')
}

const developmentJwtSecret = configuredJwtSecret || configuredSecret || randomBytes(48).toString('hex')

// Tests run the Postgres dialect against a port that refuses at once, so a test that
// forgets to fake `db` fails fast instead of reaching the database in apps/api/.env.
// shortcut: Node sets NODE_TEST_CONTEXT per test process; --test-isolation=none would not.
const TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_connects'

function resolveDatabaseUrl() {
  if (process.env.NODE_TEST_CONTEXT && !isProduction) return TEST_DATABASE_URL

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
  throw new Error('DATABASE_URL is required (postgresql://...). Set it, or set SUPABASE_URL plus DB_PASS, in apps/api/.env.')
}

const databaseUrl = resolveDatabaseUrl()

export const env = Object.freeze({
  xendit: readXenditSandboxConfig(process.env),
  isProduction,
  inventoryPreviewEnabled: !isProduction && process.env.INVENTORY_PREVIEW_ENABLED === 'true',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173'),
  supabase: {
    url: process.env.SUPABASE_URL?.trim() || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
    secretKey: process.env.SUPABASE_SECRET_KEY?.trim() || '',
    jwksUrl: process.env.SUPABASE_JWKS_URL?.trim() || '',
  },
  db: {
    connectionString: databaseUrl,
    // A Vercel deployment can run many API instances at once. Keep each
    // instance's pool small so bursts do not exhaust Supabase connections.
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? (process.env.VERCEL ? 1 : 10)),
  },
  session: {
    name: 'sti.sid',
    secret: configuredSecret || randomBytes(48).toString('hex'),
    idleTimeoutMs: 10 * 60 * 1000,
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
  jobRunner: {
    secret: configuredJobRunnerSecret,
    // A2: a laptop runs scheduled jobs only when asked, never by default against the live database.
    localTimer: process.env.JOB_RUNNER_LOCAL_TIMER === 'on',
  },
  isbnLookup: {
    timeoutMs: Math.max(500, Math.min(10000, Number(process.env.ISBN_LOOKUP_TIMEOUT_MS ?? 3500))),
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() ?? '',
  },
  printing: {
    docxRendererUrl: process.env.DOCX_RENDERER_URL?.trim() ?? '',
    docxRendererToken: process.env.DOCX_RENDERER_TOKEN?.trim() ?? '',
  },
  mail: {
    gmailUser: process.env.GMAIL_USER?.trim() || '',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD?.trim() || '',
    from: process.env.MAIL_FROM?.trim() || process.env.GMAIL_USER?.trim() || '',
  },
  passwordReset: {
    otpTtlMinutes: Math.max(5, Math.min(10, Number(process.env.PASSWORD_RESET_OTP_TTL_MINUTES ?? 10))),
    lockMinutes: Math.max(5, Math.min(60, Number(process.env.PASSWORD_RESET_LOCK_MINUTES ?? 15))),
    maxFailedAttempts: 3,
    historyLimit: 3,
    resetTokenTtlSeconds: Math.max(300, Math.min(900, Number(process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS ?? 600))),
  },
})
