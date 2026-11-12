// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const vercel = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[]
}
// Vercel builds from git (LF); a Windows checkout may have CRLF, which would change the hash.
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const spaRule = vercel.headers?.find(rule => rule.source === '/((?!api/).*)')
const header = (key: string) => spaRule?.headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value
const directive = (name: string) => header('Content-Security-Policy')?.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `))

describe('web app security headers (vercel.json)', () => {
  it('applies to every page but leaves API responses to Express', () => {
    expect(spaRule).toBeDefined()
    expect(new RegExp(`^${spaRule!.source.replace('/', '\\/')}$`).test('/api/books')).toBe(false)
  })

  it('sends a strict CSP with no inline script except the hashed theme script', () => {
    const scriptSrc = directive('script-src') ?? ''
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/)
    const inline = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
    expect(inline.length).toBeGreaterThan(0)
    for (const body of inline) {
      expect(scriptSrc).toContain(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
    }
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
  })

  it('sends the other hardening headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('Permissions-Policy')).toContain('camera=(self)')
  })
})
