import { getAccessToken } from '../auth/auth-storage'

export type AccountStatus = 'Active' | 'Deactivated' | 'Archived'
export type ActiveUser = { id: number; school_id: string; role: string; account_status: AccountStatus; full_name: string; email: string; program: string; year_or_unit: string; clearance_status: string }
export type UserSummary = { active_accounts: number; deactivated_accounts: number; archived_accounts: number; student_accounts: number; faculty_accounts: number; staff_accounts: number }
export type UserFilters = { q: string; role: string; program: string; clearance: string; status: string; page: number; limit: number }
export type Pagination = { page: number; limit: number; total: number; total_pages: number }
export type ProfileEdit = { first_name: string; last_name: string; email: string; contact_number: string; program_strand: string; year_grade_level: string; reason: string }
export type UserEvent = { id: number; action: string; previous_status: string | null; new_status: string | null; changed_fields: string | null; reason: string; created_at: string; actor_school_id: string }
export type UserDetail = { id: number; school_id: string; role: string; account_status: AccountStatus; contact_number: string | null; email: string | null; user_id: number | null; first_name: string | null; last_name: string | null; program_strand: string | null; year_grade_level: string | null; full_name: string; events: UserEvent[] }

async function request<T>(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, credentials: 'include', headers })
  const payload = await response.json() as { data?: T; message?: string; meta?: { pagination?: Pagination } }
  if (!response.ok) throw new Error(payload.message ?? 'Unable to manage users.')
  return { data: payload.data as T, meta: payload.meta }
}

export const usersApi = {
  summary: async () => (await request<UserSummary>('/api/v1/admin/users/summary')).data,
  programs: async () => (await request<string[]>('/api/v1/admin/users/programs')).data,
  directory: async (filters: UserFilters) => {
    const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) })
    for (const key of ['q', 'role', 'program', 'clearance', 'status'] as const) if (filters[key]) query.set(key, filters[key])
    const result = await request<ActiveUser[]>(`/api/v1/admin/users/directory?${query}`)
    return { rows: result.data, pagination: result.meta?.pagination ?? { page: 1, limit: filters.limit, total: 0, total_pages: 0 } }
  },
  detail: async (id: number) => (await request<UserDetail>(`/api/v1/admin/users/${id}`)).data,
  editProfile: async (id: number, body: ProfileEdit) => (await request(`/api/v1/admin/users/${id}/profile`, { method: 'PATCH', body: JSON.stringify(body) })).data,
  changeStatus: async (id: number, status: AccountStatus, reason: string) => (await request(`/api/v1/admin/users/${id}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) })).data,
}
