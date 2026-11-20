import { HttpError } from '../../core/http-error.ts'
import { MAX_WARNINGS_BEFORE_FINE } from './conduct-policy.ts'

export const MAX_VIOLATION_FINE = 999999.99

export type ViolationCategoryInput = {
  name: string
  description: string | null
  warningsBeforeFine: number
  fineAmount: number
}
export type ViolationCategoryPatch = Partial<ViolationCategoryInput> & { isActive?: boolean }

function fail(field: string, message: string): never {
  throw new HttpError(422, 'VIOLATION_CATEGORY_INVALID', message, { errors: { [field]: message } })
}

function name(value: unknown) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (text.length < 2 || text.length > 80 || /[\u0000-\u001f\u007f]/.test(text)) fail('name', 'Enter a category name of 2 to 80 characters.')
  return text
}

function description(value: unknown) {
  if (value === undefined || value === null) return null
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : null
  if (text === null || text.length > 300 || /[\u0000-\u001f\u007f]/.test(text)) fail('description', 'Keep the description to 300 characters or less.')
  return text || null
}

function warnings(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d$/.test(value.trim()) ? Number(value) : NaN
  if (!Number.isInteger(number) || number < 0 || number > MAX_WARNINGS_BEFORE_FINE) fail('warningsBeforeFine', `Choose 0 to ${MAX_WARNINGS_BEFORE_FINE} warnings before the fine.`)
  return number
}

function amount(value: unknown) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) fail('fineAmount', 'Enter a peso amount above 0 with at most 2 decimals.')
  const parsed = Number(text)
  if (parsed <= 0 || parsed > MAX_VIOLATION_FINE) fail('fineAmount', `Enter a fine above PHP 0 and up to PHP ${MAX_VIOLATION_FINE.toFixed(2)}.`)
  return parsed
}

/** Full input for a new category, or only the fields sent for an edit (`partial`). */
export function validateViolationCategory(body: unknown, partial: true): ViolationCategoryPatch
export function validateViolationCategory(body: unknown, partial?: false): ViolationCategoryInput & { isActive?: boolean }
export function validateViolationCategory(body: unknown, partial = false): ViolationCategoryPatch {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const has = (key: string) => input[key] !== undefined
  const result: ViolationCategoryPatch = {}
  if (!partial || has('name')) result.name = name(input.name)
  if (!partial || has('description')) result.description = description(input.description)
  if (!partial || has('warningsBeforeFine')) result.warningsBeforeFine = warnings(input.warningsBeforeFine)
  if (!partial || has('fineAmount')) result.fineAmount = amount(input.fineAmount)
  if (has('isActive')) {
    if (typeof input.isActive !== 'boolean') fail('isActive', 'Choose active or retired.')
    result.isActive = input.isActive
  }
  if (partial && Object.keys(result).length === 0) fail('name', 'Change at least one field before saving.')
  return result
}
