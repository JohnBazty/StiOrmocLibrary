import { timingSafeEqual } from 'node:crypto'
import type { XenditSandboxConfig } from '../../config/xendit-sandbox.ts'
import { paymentError } from './payments.validation.ts'

// Public demonstration fixtures, never actual GCash credentials or subscriber claims.
export const demoWalletAccounts = Object.freeze([
  { number: '09174826315', pin: '4826' }, { number: '09183957264', pin: '7104' },
  { number: '09196281437', pin: '3958' }, { number: '09207539618', pin: '8261' },
  { number: '09218645729', pin: '6049' }, { number: '09275418362', pin: '1537' },
  { number: '09356872941', pin: '9682' }, { number: '09453791682', pin: '2475' },
  { number: '09568247315', pin: '5316' }, { number: '09982365147', pin: '8093' },
])

export function requireDemoWalletConfig(config: XenditSandboxConfig) {
  if (!config.enabled || config.mode !== 'test' || !config.secretKey?.startsWith('xnd_development_')) {
    throw paymentError('Demo wallet is unavailable.', 'DEMO_WALLET_DISABLED', 503)
  }
}

export function verifyDemoWallet(value: unknown) {
  const row = value as { number?: unknown; pin?: unknown } | null
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || Object.keys(row).some(key => !['quoteId', 'requestKey', 'number', 'pin'].includes(key))) {
    throw paymentError('Review the demo wallet details.', 'DEMO_WALLET_INVALID', 400)
  }
  const fixture = demoWalletAccounts.find(account => account.number === row.number)
  if (!fixture || typeof row?.pin !== 'string' || !/^\d{4}$/.test(row.pin)
    || !timingSafeEqual(Buffer.from(row.pin), Buffer.from(fixture.pin))) {
    throw paymentError('Choose a demo number and its matching four-digit PIN.', 'DEMO_WALLET_INVALID', 400)
  }
}
