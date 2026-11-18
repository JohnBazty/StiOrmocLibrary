import type { Category } from './types'

const words = (text: string) => text.toLocaleLowerCase('en-US').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
// Google sends "Fiction / Animals"; Open Library sends "Philippines -- History"; each part may name a category.
const partsOf = (subject: string) => [subject, ...subject.split(/\s+\/\s+|\s+--\s+/)].map(words).filter(Boolean)

/**
 * The library category a lookup's subjects point to: an exact name first, then a name that appears
 * as whole words in a subject. Null when nothing fits; staff always confirm or change the choice.
 */
export function matchCategory(subjects: string[], categories: Category[]): { category: Category; subject: string } | null {
  const named = categories.map((category) => ({ category, name: words(category.categoryName) })).filter((entry) => entry.name)
  for (const exact of [true, false]) {
    for (const subject of subjects) {
      for (const part of partsOf(subject)) {
        const hit = named.find(({ name }) => (exact ? part === name : ` ${part} `.includes(` ${name} `)))
        if (hit) return { category: hit.category, subject }
      }
    }
  }
  return null
}
