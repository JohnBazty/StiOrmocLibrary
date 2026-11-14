
export type ThesisCoverTone = 'it' | 'tourism' | 'hospitality' | 'neutral'

export type ThesisCoverTheme = {
  tone: ThesisCoverTone
  background: string
  text: string
  muted: string
}

const THEMES: Record<ThesisCoverTone, ThesisCoverTheme> = {
  it: { tone: 'it', background: '#08457a', text: '#FFF200', muted: 'rgba(255,242,0,0.82)' },
  tourism: { tone: 'tourism', background: '#d9b800', text: '#0b5ea2', muted: 'rgba(11,94,162,0.82)' },
  hospitality: { tone: 'hospitality', background: '#165c2f', text: '#FFF200', muted: 'rgba(255,242,0,0.82)' },
  neutral: { tone: 'neutral', background: '#2a3140', text: '#f4e7b0', muted: 'rgba(244,231,176,0.82)' },
}

const IT_MARKERS = [
  'information technology',
  'mobile app and web',
  'computer and communications',
]

const TOURISM_MARKERS = [
  'tourism management',
  'tourism operations',
]

const HOSPITALITY_MARKERS = [
  'hospitality management',
  'culinary arts',
]


export function normalizeDepartmentLabel(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveThesisCoverTone(department: string | null | undefined): ThesisCoverTone {
  const label = normalizeDepartmentLabel(department)
  if (!label) return 'neutral'
  if (IT_MARKERS.some((marker) => label.includes(marker))) return 'it'
  if (TOURISM_MARKERS.some((marker) => label.includes(marker))) return 'tourism'
  if (HOSPITALITY_MARKERS.some((marker) => label.includes(marker))) return 'hospitality'
  return 'neutral'
}

export function thesisCoverTheme(department: string | null | undefined): ThesisCoverTheme {
  return THEMES[resolveThesisCoverTone(department)]
}


export function resolveDegreeLine(department: string | null | undefined) {
  const label = normalizeDepartmentLabel(department)
  if (label.includes('information technology') && label.includes('bachelor')) {
    return 'Bachelor of Science in Information Technology'
  }
  if (label.includes('tourism management')) return 'Bachelor of Science in Tourism Management'
  if (label.includes('hospitality management')) return 'Bachelor of Science in Hospitality Management'
  if (label.includes('mobile app and web')) return 'IT in Mobile App and Web Development'
  if (label.includes('computer and communications')) return 'Computer and Communications Technology'
  if (label.includes('tourism operations')) return 'Tourism Operations'
  if (label.includes('culinary arts')) return 'Culinary Arts'
  if (label === 'stem' || label === 'abm' || label === 'humss' || label === 'general academic') {
    return `Senior High School — ${(department ?? '').trim()}`
  }
  return (department ?? '').trim() || 'Undergraduate Program'
}

export function formatThesisCoverDate(publicationYear: number | null | undefined) {
  if (!publicationYear) return 'YEAR NOT RECORDED'
  return String(publicationYear)
}

export function splitThesisAuthors(authors: string | null | undefined) {
  const raw = (authors ?? '').trim()
  if (!raw) return []
  if (raw.includes(';')) return raw.split(/\s*;\s*/).map((name) => name.trim()).filter(Boolean)
  return raw.split(/\s*,\s*/).map((name) => name.trim()).filter(Boolean)
}
