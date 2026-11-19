import { HttpError } from '../../core/http-error.ts'
import {
  SUPPORTED_MATERIAL_TYPES,
  type PublishBorrowingPolicyInput,
  type SupportedMaterialType,
} from './borrowing-policy.types.ts'

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'BORROWING_POLICY_INVALID_BODY', 'Provide a valid borrowing policy body.')
  }
  return body as Record<string, unknown>
}

function requirePositiveInt(value: unknown, field: string, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `${field} must be an integer from ${min} to ${max}.`, {
      errors: { [field]: `Must be an integer from ${min} to ${max}.` },
    })
  }
  return number
}

function optionalUnlimitedInt(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  return requirePositiveInt(value, field, min, max)
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  if (value === 0 || value === 1 || value === '0' || value === '1') return Boolean(Number(value))
  throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `${field} must be a boolean.`, {
    errors: { [field]: 'Must be a boolean.' },
  })
}

function requireDate(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `${field} must be a YYYY-MM-DD date.`, {
      errors: { [field]: 'Must be a YYYY-MM-DD date.' },
    })
  }
  return text
}

function requireCutoff(value: unknown, field = 'dueTimeCutoff'): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `${field} must be HH:mm or HH:mm:ss.`, {
      errors: { [field]: 'Must be HH:mm or HH:mm:ss.' },
    })
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] ? Number(match[3]) : 0
  if (hour > 23 || minute > 59 || second > 59) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `${field} is not a valid time.`, {
      errors: { [field]: 'Must be a valid time of day.' },
    })
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

/** Checkout must open while the library is open (08:00 to 16:59); matches migration 041's check. */
function requireCheckoutOpensAt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '14:00:00'
  const time = requireCutoff(value, 'checkoutOpensAt')
  if (time < '08:00:00' || time >= '17:00:00') {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'checkoutOpensAt must be between 08:00 and 16:59.', {
      errors: { checkoutOpensAt: 'Choose a time from 8:00 AM to 4:59 PM.' },
    })
  }
  return time
}

function requireReason(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (trimmed.length < 10 || trimmed.length > 500 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'changeReason must be 10 to 500 characters.', {
      errors: { changeReason: 'Must be 10 to 500 characters without control characters.' },
    })
  }
  return trimmed
}

function requireMaterialRules(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'materialRules must list every supported material type.', {
      errors: { materialRules: 'Provide one rule per supported material type.' },
    })
  }
  const seen = new Set<string>()
  const rules = value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `materialRules[${index}] is invalid.`)
    }
    const row = item as Record<string, unknown>
    const materialType = String(row.materialType ?? row.material_type ?? '')
    if (!(SUPPORTED_MATERIAL_TYPES as readonly string[]).includes(materialType)) {
      throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `Unsupported material type: ${materialType}.`, {
        errors: { materialRules: `Unknown material type ${materialType}.` },
      })
    }
    if (seen.has(materialType)) {
      throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `Duplicate material type: ${materialType}.`, {
        errors: { materialRules: `Duplicate material type ${materialType}.` },
      })
    }
    seen.add(materialType)
    const isBorrowable = requireBoolean(row.isBorrowable ?? row.is_borrowable, `materialRules[${index}].isBorrowable`)
    if (isBorrowable && materialType === 'Thesis/Manuscript') {
      throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'Thesis/Manuscript cannot be enabled for circulation.', {
        errors: { materialRules: 'Thesis/Manuscript has no supported physical-circulation path.' },
      })
    }
    return { materialType: materialType as SupportedMaterialType, isBorrowable }
  })
  for (const type of SUPPORTED_MATERIAL_TYPES) {
    if (!seen.has(type)) {
      throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', `Missing material rule for ${type}.`, {
        errors: { materialRules: `Missing material rule for ${type}.` },
      })
    }
  }
  if (!rules.some((rule) => rule.isBorrowable)) {
    throw new HttpError(422, 'BORROWING_POLICY_VALIDATION_FAILED', 'At least one borrowable material type is required.', {
      errors: { materialRules: 'Enable at least one supported circulation material type.' },
    })
  }
  return rules
}

export function validatePublishBorrowingPolicy(body: unknown): PublishBorrowingPolicyInput {
  const input = asObject(body)
  return {
    effectiveOn: requireDate(input.effectiveOn ?? input.effective_on, 'effectiveOn'),
    studentMaxActiveBooks: requirePositiveInt(input.studentMaxActiveBooks ?? input.student_max_active_books, 'studentMaxActiveBooks', 1, 20),
    facultyMaxActiveBooks: optionalUnlimitedInt(input.facultyMaxActiveBooks ?? input.faculty_max_active_books, 'facultyMaxActiveBooks', 1, 100),
    borrowingDays: requirePositiveInt(input.borrowingDays ?? input.borrowing_days, 'borrowingDays', 1, 60),
    dueTimeCutoff: requireCutoff(input.dueTimeCutoff ?? input.due_time_cutoff),
    checkoutOpensAt: requireCheckoutOpensAt(input.checkoutOpensAt ?? input.checkout_opens_at),
    maxRenewals: requirePositiveInt(input.maxRenewals ?? input.max_renewals, 'maxRenewals', 0, 10),
    renewalExtensionDays: requirePositiveInt(input.renewalExtensionDays ?? input.renewal_extension_days, 'renewalExtensionDays', 1, 60),
    studentMaxActiveReservations: requirePositiveInt(
      input.studentMaxActiveReservations ?? input.student_max_active_reservations,
      'studentMaxActiveReservations',
      1,
      20,
    ),
    facultyMaxActiveReservations: optionalUnlimitedInt(
      input.facultyMaxActiveReservations ?? input.faculty_max_active_reservations,
      'facultyMaxActiveReservations',
      1,
      100,
    ),
    blockRenewalIfOverdue: requireBoolean(input.blockRenewalIfOverdue ?? input.block_renewal_if_overdue, 'blockRenewalIfOverdue'),
    blockRenewalIfUnpaidFines: requireBoolean(
      input.blockRenewalIfUnpaidFines ?? input.block_renewal_if_unpaid_fines,
      'blockRenewalIfUnpaidFines',
    ),
    blockRenewalIfReserved: requireBoolean(input.blockRenewalIfReserved ?? input.block_renewal_if_reserved, 'blockRenewalIfReserved'),
    longOverdueAfterDays: requirePositiveInt(
      input.longOverdueAfterDays ?? input.long_overdue_after_days,
      'longOverdueAfterDays',
      1,
      365,
    ),
    changeReason: requireReason(input.changeReason ?? input.change_reason),
    materialRules: requireMaterialRules(input.materialRules ?? input.material_rules),
  }
}
