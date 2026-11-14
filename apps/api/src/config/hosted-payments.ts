import type { XenditSandboxConfig } from './xendit-sandbox.ts'

/** Hosted practice checkout never enables the real obligation-settlement gateway. */
export function readHostedPaymentConfig(settings: Record<string, string | undefined>): XenditSandboxConfig {
  if (settings.HOSTED_PAYMENT_PREVIEW !== 'true') return { enabled: false }
  if (settings.XENDIT_ENABLED === 'true' || settings.XENDIT_MODE !== 'test') throw new Error('Hosted payment mode is invalid.')
  const secretKey = settings.XENDIT_SECRET_KEY?.trim() ?? ''
  const webhookToken = settings.XENDIT_WEBHOOK_TOKEN?.trim() ?? ''
  if (!/^xnd_development_[A-Za-z0-9_-]{20,}$/.test(secretKey) || !/^[A-Za-z0-9_-]{24,}$/.test(webhookToken)) throw new Error('Hosted payment credentials are invalid.')
  if (settings.WEB_ORIGIN !== 'https://sti-ormoc-smart-library.vercel.app') throw new Error('Hosted payment origin is invalid.')
  const databaseUrl = settings.DATABASE_URL ?? ''
  let database: URL
  try { database = new URL(databaseUrl) } catch { throw new Error('Hosted payment database is invalid.') }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('Hosted payment database is invalid.')
  return Object.freeze({ enabled: true, mode: 'test', secretKey, webhookToken, databaseUrl,
    apiOrigin: 'https://api.xendit.co', webhookUrl: null, returnUrl: settings.WEB_ORIGIN + '/payments/result' })
}
