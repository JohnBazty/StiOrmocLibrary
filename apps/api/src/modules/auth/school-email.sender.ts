import { HttpError } from '../../core/http-error.ts'
import { SYSTEM_SHORT_NAME } from '../../config/branding.ts'
import nodemailer from 'nodemailer'

const unavailable = () => new HttpError(503, 'EMAIL_SENDER_NOT_CONFIGURED', 'School-email verification is not configured yet. Please contact the library administrator.')

export function requireVerificationSender(address: string) {
  const gmailUser = process.env.GMAIL_SENDER_EMAIL?.trim().toLowerCase()
  const gmailPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')
  if (gmailUser || gmailPassword) {
    if (!gmailUser || !gmailPassword || !/^[^\s@]+@gmail\.com$/.test(gmailUser)) throw unavailable()
    if (process.env.NODE_ENV === 'production' && process.env.GMAIL_ALLOW_PRODUCTION !== 'true') throw unavailable()
    return { provider: 'gmail' as const, user: gmailUser, appPassword: gmailPassword }
  }
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim()
  if (resendKey || resendFrom) {
    if (!resendKey || !resendFrom) throw unavailable()
    if (resendFrom.toLowerCase() === 'onboarding@resend.dev') {
      const testRecipient = process.env.RESEND_TEST_RECIPIENT?.trim().toLowerCase()
      if (process.env.NODE_ENV === 'production') throw unavailable()
      if (!testRecipient || address.trim().toLowerCase() !== testRecipient) {
        throw new HttpError(422, 'EMAIL_TEST_RECIPIENT_ONLY', 'This local email test can send only to the configured test recipient.')
      }
    }
    return { provider: 'resend' as const, key: resendKey, from: resendFrom }
  }
  const tenant = process.env.MS_GRAPH_TENANT_ID?.trim()
  const client = process.env.MS_GRAPH_CLIENT_ID?.trim()
  const secret = process.env.MS_GRAPH_CLIENT_SECRET?.trim()
  const sender = process.env.MS_GRAPH_SENDER_EMAIL?.trim()
  if (!tenant || !client || !secret || !sender) throw unavailable()
  return { provider: 'graph' as const, tenant, client, secret, sender }
}

/** Send from configured Gmail, Resend, or an institution-approved Microsoft 365 mailbox. */
export async function sendSchoolVerificationCode(address: string, code: string) {
  const sender = requireVerificationSender(address)
  const content = `Your ${SYSTEM_SHORT_NAME} verification code is ${code}. It expires in 10 minutes. If you did not request an account, ignore this message.`
  const subject = `${SYSTEM_SHORT_NAME} verification code`
  if (sender.provider === 'gmail') {
    try {
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: sender.user, pass: sender.appPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
      await transport.sendMail({
        from: sender.user,
        to: address,
        subject,
        text: content,
      })
    } catch {
      throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
    }
    return
  }
  if (sender.provider === 'resend') {
    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sender.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender.from, to: [address], subject, text: content }),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
    }
    if (!response.ok) throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
    return
  }
  const credentials = new URLSearchParams({
    client_id: sender.client, client_secret: sender.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  })
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(sender.tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: credentials,
    signal: AbortSignal.timeout(10000),
  })
  if (!tokenResponse.ok) throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
  const token = await tokenResponse.json() as { access_token?: string }
  if (!token.access_token) throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
  const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender.sender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      subject,
      body: { contentType: 'Text', content },
      toRecipients: [{ emailAddress: { address } }],
    } }), signal: AbortSignal.timeout(10000),
  })
  if (!sendResponse.ok) throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Verification email is unavailable. Please try again later.')
}
