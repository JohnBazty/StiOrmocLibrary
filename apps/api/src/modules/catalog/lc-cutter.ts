export const LC_CUTTER_VERSION = 'lc-cutter-g63-2026-11-20-v1'

export type CutterHeadingType = 'author' | 'title' | 'organization'

export type CutterHeading = {
  heading: string
  headingType: CutterHeadingType
}

export type CutterRuleKey =
  | 'initial_vowel'
  | 'initial_s'
  | 'initial_qu'
  | 'initial_qa_qt'
  | 'initial_consonant'
  | 'arabic_numeral'

export type GeneratedCutter = {
  cutter: string
  heading: string
  headingType: CutterHeadingType
  ruleKey: CutterRuleKey
}

export const LC_CUTTER_TABLE_REFERENCE = Object.freeze({
  version: LC_CUTTER_VERSION,
  source: 'Library of Congress Subject Cataloging Manual: Shelflisting (G 63)',
  rules: Object.freeze([
    Object.freeze({
      key: 'initial_vowel',
      title: '1. After initial vowels (A, E, I, O, U)',
      columns: Object.freeze([
        ['b', '2'],
        ['d', '3'],
        ['l–m', '4'],
        ['n', '5'],
        ['p', '6'],
        ['r', '7'],
        ['s–t', '8'],
        ['u–y', '9'],
      ]),
    }),
    Object.freeze({
      key: 'initial_s',
      title: '2. After initial letter S',
      columns: Object.freeze([
        ['a', '2'],
        ['ch', '3'],
        ['e', '4'],
        ['h–i', '5'],
        ['m–p', '6'],
        ['t', '7'],
        ['u', '8'],
        ['w–z', '9'],
      ]),
    }),
    Object.freeze({
      key: 'initial_qu',
      title: '3. After initial letters Qu (and Qa–Qt = 2–29)',
      columns: Object.freeze([
        ['a', '3'],
        ['e', '4'],
        ['i', '5'],
        ['o', '6'],
        ['r', '7'],
        ['t', '8'],
        ['y', '9'],
      ]),
    }),
    Object.freeze({
      key: 'initial_consonant',
      title: '4. After other initial consonants',
      columns: Object.freeze([
        ['a', '3'],
        ['e', '4'],
        ['i', '5'],
        ['o', '6'],
        ['r', '7'],
        ['u', '8'],
        ['y', '9'],
      ]),
    }),
    Object.freeze({
      key: 'expansion',
      title: '5. For expansion (third and subsequent letters)',
      columns: Object.freeze([
        ['a–d', '3'],
        ['e–h', '4'],
        ['i–l', '5'],
        ['m–o', '6'],
        ['p–s', '7'],
        ['t–v', '8'],
        ['w–z', '9'],
      ]),
    }),
  ]),
})

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function transliterate(text: string): string {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    if (lower in CYRILLIC_MAP) {
      const mapped = CYRILLIC_MAP[lower]
      out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1)
    } else {
      out += ch
    }
  }
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const SUFFIX_RE = /^(jr\.?|sr\.?|ii|iii|iv|ph\.?d\.?|m\.?d\.?|ed\.?d\.?|d\.?t\.?r\.?|r\.?d\.?|m\.?s\.?|et\.?\s*al\.?)$/i
const COMPOUND_PREFIXES = new Set(['de', 'del', 'dela', 'de la', 'van', 'von', 'st', 'st.', 'sta', 'sta.'])
const ORG_RE = /^(sti|ched|dap|mdi|cmp media llc|microsoft|american\b|university\b|committee\b|editors?\s+of\b|grolier\b|world\s+book|encyclop|lonely\s+planet|time-life|w\.?h\.?smith|salton|rebus)/i

export function extractCutterHeading(input: {
  authors?: string | string[] | null
  title?: string | null
}): CutterHeading {
  const rawAuthors = Array.isArray(input.authors)
    ? input.authors.join('; ')
    : String(input.authors ?? '').trim()

  const firstAuthor = rawAuthors
    .split(/\s*;\s*|\s+\band\b\s+|\s*&\s*/i)[0]
    ?.replace(/\bet\.?\s*al\.?$/i, '')
    .replace(/[\[\]]/g, '')
    .trim()

  if (firstAuthor && !/^(unknown|not verified|n\/a|-)$/i.test(firstAuthor)) {
    const cleanAuthor = transliterate(firstAuthor).replace(/\s+/g, ' ').trim()
    if (ORG_RE.test(cleanAuthor) || /^[A-Z0-9]{2,6}$/.test(cleanAuthor)) {
      const strippedOrg = cleanAuthor.replace(/^editors?\s+of\s+(the\s+)?/i, '').trim()
      return { heading: strippedOrg || cleanAuthor, headingType: 'organization' }
    }

    // Remove trailing degree/generational suffixes after comma: "Leo Finkelstein, Jr."
    const commaParts = cleanAuthor
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .filter(p => !SUFFIX_RE.test(p))

    const baseName = commaParts[0] ?? cleanAuthor
    const tokens = baseName
      .split(/\s+/)
      .filter(t => !SUFFIX_RE.test(t.replace(/[,.;]/g, '')))

    if (tokens.length <= 1) {
      return { heading: tokens[0] || cleanAuthor, headingType: 'author' }
    }

    const last = tokens[tokens.length - 1]
    const prev = tokens[tokens.length - 2]?.toLowerCase().replace(/\./g, '')
    const prev2 = tokens.length >= 3 ? `${tokens[tokens.length - 3].toLowerCase()} ${prev}` : ''
    if (prev2 && COMPOUND_PREFIXES.has(prev2)) {
      return {
        heading: `${tokens[tokens.length - 3]} ${tokens[tokens.length - 2]} ${last}`,
        headingType: 'author',
      }
    }
    if (prev && COMPOUND_PREFIXES.has(prev)) {
      return { heading: `${tokens[tokens.length - 2]} ${last}`, headingType: 'author' }
    }
    return { heading: last, headingType: 'author' }
  }

  const rawTitle = transliterate(String(input.title ?? '').trim())
    .replace(/^(the|a|an|ang|mga)\s+/i, '')
    .trim()
  return { heading: rawTitle || 'Untitled', headingType: 'title' }
}

function expansionDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'o') return '6'
  if (ch <= 's') return '7'
  if (ch <= 'v') return '8'
  return '9'
}

function vowelSecondDigit(ch: string | undefined): string {
  if (!ch) return '2'
  if (ch <= 'b') return '2'
  if (ch <= 'k') return '3'
  if (ch <= 'm') return '4'
  if (ch === 'n') return '5'
  if (ch <= 'q') return '6'
  if (ch === 'r') return '7'
  if (ch <= 't') return '8'
  return '9'
}

function sSecondDigit(rest: string): { digit: string; consumed: number } {
  if (!rest) return { digit: '2', consumed: 0 }
  if (rest.startsWith('ch')) return { digit: '3', consumed: 2 }
  const ch = rest[0]
  if (ch <= 'b') return { digit: '2', consumed: 1 }
  if (ch <= 'd') return { digit: '3', consumed: 1 }
  if (ch <= 'g') return { digit: '4', consumed: 1 }
  if (ch <= 'l') return { digit: '5', consumed: 1 }
  if (ch <= 'p') return { digit: '6', consumed: 1 }
  if (ch <= 't') return { digit: '7', consumed: 1 }
  if (ch === 'u') return { digit: '8', consumed: 1 }
  return { digit: '9', consumed: 1 }
}

function quThirdDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'q') return '6'
  if (ch <= 's') return '7'
  if (ch <= 'v') return '8'
  return '9'
}

function consonantSecondDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'q') return '6'
  if (ch <= 't') return '7'
  if (ch <= 'x') return '8'
  return '9'
}

export function isValidCutter(value: string): boolean {
  return /^[A-Z][0-9]+$/.test(value) && value.length <= 40
}

export function generateLcCutter(input: {
  heading: string
  headingType?: CutterHeadingType
  existingCutters?: Iterable<string>
  digits?: number
}): GeneratedCutter {
  const headingType = input.headingType ?? 'author'
  const cleaned = transliterate(String(input.heading ?? '').trim())
  const existing = new Set(Array.from(input.existingCutters ?? [], c => c.toUpperCase()))

  const digitMatch = cleaned.match(/^\d+/)
  if (digitMatch) {
    const num = Number(digitMatch[0])
    const bucket =
      num <= 9 ? 2 : num <= 99 ? 3 : num <= 999 ? 4 : num <= 1999 ? 6 : num <= 2999 ? 7 : 8
    let candidate = `A1${bucket}`
    let suffix = 3
    while (existing.has(candidate)) {
      candidate = `A1${bucket}${suffix}`
      suffix = suffix >= 9 ? 3 : suffix + 1
    }
    return { cutter: candidate, heading: input.heading, headingType, ruleKey: 'arabic_numeral' }
  }

  const letters = cleaned.toLowerCase().replace(/[^a-z]/g, '')
  if (!letters) {
    return { cutter: 'A33', heading: input.heading || 'Unknown', headingType, ruleKey: 'initial_vowel' }
  }

  const first = letters[0].toUpperCase()
  const rest = letters.slice(1)
  let base = first
  let consumed = 0
  let ruleKey: CutterRuleKey = 'initial_consonant'

  if ('AEIOU'.includes(first)) {
    ruleKey = 'initial_vowel'
    base += vowelSecondDigit(rest[0])
    consumed = 1
  } else if (first === 'S') {
    ruleKey = 'initial_s'
    const s = sSecondDigit(rest)
    base += s.digit
    consumed = s.consumed
  } else if (first === 'Q' && rest.startsWith('u')) {
    ruleKey = 'initial_qu'
    base += quThirdDigit(rest[1])
    consumed = 2
  } else if (first === 'Q') {
    ruleKey = 'initial_qa_qt'
    base += '2' + expansionDigit(rest[1] ?? rest[0])
    consumed = 2
  } else {
    ruleKey = 'initial_consonant'
    base += consonantSecondDigit(rest[0])
    consumed = 1
  }

  const targetDigits = input.digits ?? 2
  let tailIndex = consumed
  while (base.length - 1 < targetDigits && tailIndex < rest.length) {
    base += expansionDigit(rest[tailIndex])
    tailIndex++
  }

  let candidate = base
  while (existing.has(candidate)) {
    if (tailIndex < rest.length) {
      candidate += expansionDigit(rest[tailIndex])
      tailIndex++
    } else {
      const lastDigit = Number(candidate[candidate.length - 1] ?? '3')
      const nextDigit = lastDigit < 9 ? lastDigit + 1 : 3
      candidate += String(nextDigit)
    }
  }

  return { cutter: candidate, heading: input.heading, headingType, ruleKey }
}

export function formatCallNumber(deweyCode: string, cutter: string): string {
  const cleanDewey = String(deweyCode ?? '').trim()
  const cleanCutter = String(cutter ?? '').trim().toUpperCase()
  return [cleanDewey, cleanCutter].filter(Boolean).join(' ')
}
