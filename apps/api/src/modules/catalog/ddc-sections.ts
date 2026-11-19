import { sectionData, type DdcSectionStatus } from './ddc-sections.data.ts'

export const ddcReference = Object.freeze({
  version: 'ddc-sections-2026-11-20-v1',
  scope: 'Three-digit sections; no decimal schedules',
  source: 'https://en.wikipedia.org/w/index.php?title=List_of_Dewey_Decimal_classes&oldid=1380680828',
  verificationSource: 'https://www.oclc.org/content/dam/oclc/dewey/ddc23-summaries.pdf',
  attribution: 'Wikipedia contributors, List of Dewey Decimal classes; adapted with explicit position statuses.',
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
})

export type DdcSection = Readonly<{
  code: string
  label: string
  division: string
  status: DdcSectionStatus
  replacement?: string
}>

export const ddcSections: readonly DdcSection[] = Object.freeze(sectionData.map(([code, label, status, replacement]) =>
  Object.freeze({ code, label, division: code.slice(0, 2) + '0', status, ...(replacement ? { replacement } : {}) }),
))

export function findDdcSection(code: string): DdcSection | undefined {
  if (!/^\d{3}$/.test(code)) return undefined
  return ddcSections[Number(code)]
}

export function isAutomaticDdcSection(code: string) {
  return findDdcSection(code)?.status === 'active'
}

export function isDdcWithin(section: string, category: string) {
  if (!isAutomaticDdcSection(section) || !isAutomaticDdcSection(category)) return false
  if (section === category) return true
  if (category.endsWith('00')) return section[0] === category[0]
  return category.endsWith('0') && section.slice(0, 2) === category.slice(0, 2)
}
