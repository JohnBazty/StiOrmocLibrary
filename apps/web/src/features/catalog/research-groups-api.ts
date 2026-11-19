import { enhancedRequest } from './enhanced-catalog-api'
export type ResearchGroup = { id: number; department: string; program: string; yearLevel: number; active: boolean; version: number; label: string; uses: number }
export type ResearchAssignment = { researchRecordId: number; groupId: number | null; version: number; legacyDepartment: string }
const base = '/api/v1/admin/maintenance'
export const researchGroupsApi = {
  list: (admin = false) => enhancedRequest<ResearchGroup[]>(admin ? `${base}/research-groups` : '/api/public/catalog/research-groups'),
  save: (group: Partial<ResearchGroup>) => enhancedRequest(`${base}/research-groups${group.id ? `/${group.id}` : ''}`, { method: group.id ? 'PATCH' : 'POST', body: JSON.stringify(group) }),
  assignment: (titleId: number) => enhancedRequest<ResearchAssignment>(`${base}/research-group-assignments/${titleId}`),
  assign: (titleId: number, groupId: number, version: number) => enhancedRequest<ResearchAssignment>(`${base}/research-group-assignments/${titleId}`, { method: 'PUT', body: JSON.stringify({ groupId, version }) }),
}
