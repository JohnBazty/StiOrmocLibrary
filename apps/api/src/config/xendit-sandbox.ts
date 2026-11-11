type Settings = Record<string, string | undefined>

export type XenditSandboxConfig = { readonly enabled: false } | {
  readonly enabled: true
  readonly mode: 'test'
  readonly apiOrigin: 'https://api.xendit.co'
  readonly secretKey: string
  readonly webhookToken: string
  readonly databaseUrl: string
  readonly webhookUrl: string | null
  readonly returnUrl: string | null
}

const invalid = (field: string) => new Error('Invalid sandbox configuration for ' + field + '.')

export function readXenditSandboxConfig(settings: Settings): XenditSandboxConfig {
  const enabled = settings.XENDIT_ENABLED?.trim() || 'false'
  if (!['true', 'false'].includes(enabled)) throw invalid('XENDIT_ENABLED')
  if (enabled === 'false') return Object.freeze({ enabled: false })
  if (settings.XENDIT_MODE?.trim() !== 'test') throw invalid('XENDIT_MODE')

  const secretKey = settings.XENDIT_SECRET_KEY?.trim() || ''
  const webhookToken = settings.XENDIT_WEBHOOK_TOKEN?.trim() || ''
  if (!/^xnd_development_[A-Za-z0-9_-]{20,}$/.test(secretKey)) throw invalid('XENDIT_SECRET_KEY')
  if (!/^[A-Za-z0-9_-]{24,}$/.test(webhookToken)) throw invalid('XENDIT_WEBHOOK_TOKEN')
  const apiOrigin = settings.XENDIT_API_BASE_URL?.trim() || 'https://api.xendit.co'
  if (apiOrigin !== 'https://api.xendit.co') throw invalid('XENDIT_API_BASE_URL')

  const databaseUrl = settings.XENDIT_SANDBOX_DATABASE_URL?.trim() || ''
  let database: URL
  try { database = new URL(databaseUrl) } catch { throw invalid('XENDIT_SANDBOX_DATABASE_URL') }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
    || database.pathname !== '/sti_xendit_sandbox'
    || database.username !== 'sandbox_app' || !database.password
    || database.search || database.hash
    || settings.DATABASE_URL?.trim() !== databaseUrl) {
    throw invalid('XENDIT_SANDBOX_DATABASE_URL')
  }

  const publicOrigin = settings.XENDIT_SANDBOX_PUBLIC_ORIGIN?.trim()
  let origin: URL | null = null
  if (publicOrigin) {
    try { origin = new URL(publicOrigin) } catch { throw invalid('XENDIT_SANDBOX_PUBLIC_ORIGIN') }
    if (origin.protocol !== 'https:' || origin.username || origin.password
      || origin.pathname !== '/' || origin.search || origin.hash
      || ['localhost', '127.0.0.1', '[::1]', 'sti-ormoc-smart-library.vercel.app'].includes(origin.hostname)) {
      throw invalid('XENDIT_SANDBOX_PUBLIC_ORIGIN')
    }
  }

  return Object.freeze({
    enabled: true, mode: 'test', apiOrigin, secretKey, webhookToken, databaseUrl,
    webhookUrl: origin ? origin.origin + '/api/payments/xendit/webhook' : null,
    returnUrl: origin ? origin.origin + '/payments/result' : null,
  })
}
