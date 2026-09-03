import { createHmac, timingSafeEqual } from 'node:crypto'
import { open } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { env } from '../../config/env.js'

export const CSV_INTEGRITY_MARKER = '__SMARTLIB_REPORT_SIGNATURE__'
export const CSV_INTEGRITY_VERSION = 'v1'
export const CSV_INTEGRITY_ALGORITHM = 'HMAC-SHA256'

const FOOTER_PREFIX = `\r\n${CSV_INTEGRITY_MARKER},`

function integrityHmac(dataset: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`SmartLib CSV integrity\0${CSV_INTEGRITY_VERSION}\0${dataset}\0`, 'utf8')
}

/**
 * Adds a cryptographic footer while preserving streaming behavior. The footer
 * authenticates every preceding CSV byte, so edits, inserted/deleted rows, and
 * row reordering invalidate the report seal.
 */
export function createIntegrityProtectedCsvStream(
  source: AsyncIterable<string | Buffer>,
  dataset: string,
  columnCount: number,
  secret = env.reports.integritySecret,
) {
  async function* signedContent() {
    const hmac = integrityHmac(dataset, secret)
    let lastChunkEndedWithCrLf = false

    for await (const chunk of source) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
      hmac.update(bytes)
      lastChunkEndedWithCrLf = bytes.subarray(-2).equals(Buffer.from('\r\n'))
      yield bytes
    }

    if (!lastChunkEndedWithCrLf) hmac.update('\r\n', 'utf8')
    const signature = hmac.digest('hex')
    const fields = [CSV_INTEGRITY_MARKER, CSV_INTEGRITY_VERSION, dataset, CSV_INTEGRITY_ALGORITHM, signature]
    while (fields.length < columnCount) fields.push('')
    yield `${lastChunkEndedWithCrLf ? '' : '\r\n'}${fields.join(',')}\r\n`
  }

  return Readable.from(signedContent())
}

export type CsvIntegrityResult = {
  valid: boolean
  dataset: string | null
  reason?: string
}

function parseFooter(footer: string) {
  const normalized = footer.replace(/\r?\n$/, '')
  if (normalized.includes('\r') || normalized.includes('\n')) return null
  const [marker, version, dataset, algorithm, signature] = normalized.split(',')
  if (
    marker !== CSV_INTEGRITY_MARKER
    || version !== CSV_INTEGRITY_VERSION
    || algorithm !== CSV_INTEGRITY_ALGORITHM
    || !dataset
    || !/^[a-f0-9]{64}$/i.test(signature ?? '')
  ) return null
  return { dataset, signature: signature.toLowerCase() }
}

export function verifyIntegrityProtectedCsv(
  report: Buffer,
  secret = env.reports.integritySecret,
): CsvIntegrityResult {
  const marker = Buffer.from(FOOTER_PREFIX, 'utf8')
  const markerIndex = report.lastIndexOf(marker)
  if (markerIndex < 0) return { valid: false, dataset: null, reason: 'SmartLib integrity footer is missing.' }

  const footerStart = markerIndex + 2
  const parsed = parseFooter(report.subarray(footerStart).toString('utf8'))
  if (!parsed) return { valid: false, dataset: null, reason: 'SmartLib integrity footer is malformed.' }

  const calculated = integrityHmac(parsed.dataset, secret).update(report.subarray(0, footerStart)).digest()
  const supplied = Buffer.from(parsed.signature, 'hex')
  return timingSafeEqual(calculated, supplied)
    ? { valid: true, dataset: parsed.dataset }
    : { valid: false, dataset: parsed.dataset, reason: 'The CSV contents were changed after export.' }
}

/** Verifies large reports without reading the entire CSV into application memory. */
export async function verifyIntegrityProtectedCsvFile(
  filePath: string,
  secret = env.reports.integritySecret,
): Promise<CsvIntegrityResult> {
  const handle = await open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const tailSize = Math.min(size, 16 * 1024)
    const tail = Buffer.alloc(tailSize)
    await handle.read(tail, 0, tailSize, size - tailSize)

    const marker = Buffer.from(FOOTER_PREFIX, 'utf8')
    const tailMarkerIndex = tail.lastIndexOf(marker)
    if (tailMarkerIndex < 0) return { valid: false, dataset: null, reason: 'SmartLib integrity footer is missing.' }

    const footerStart = size - tailSize + tailMarkerIndex + 2
    const parsed = parseFooter(tail.subarray(tailMarkerIndex + 2).toString('utf8'))
    if (!parsed) return { valid: false, dataset: null, reason: 'SmartLib integrity footer is malformed.' }

    const hmac = integrityHmac(parsed.dataset, secret)
    for await (const chunk of createReadStream(filePath, { start: 0, end: footerStart - 1 })) hmac.update(chunk as Buffer)
    const calculated = hmac.digest()
    const supplied = Buffer.from(parsed.signature, 'hex')
    return timingSafeEqual(calculated, supplied)
      ? { valid: true, dataset: parsed.dataset }
      : { valid: false, dataset: parsed.dataset, reason: 'The CSV contents were changed after export.' }
  } finally {
    await handle.close()
  }
}
