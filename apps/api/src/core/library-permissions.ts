import type { JwtRole } from '../modules/auth/jwt-auth.service.ts'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { HttpError } from './http-error.ts'

/** Library authority; Admin is retained only for existing account/bootstrap recovery. */
export const libraryPermissionRoles = {
  'accounts.manage': ['Librarian', 'Admin'],
  'library.manage': ['Librarian'],
  'desk.operate': ['Librarian', 'Staff'],
  'announcements.manage': ['Librarian', 'Staff'],
  'self-service.use': ['Student', 'Faculty'],
} satisfies Record<string, JwtRole[]>

export type LibraryPermission = keyof typeof libraryPermissionRoles
export function hasLibraryPermission(role: JwtRole, permission: LibraryPermission) {
  return (libraryPermissionRoles[permission] as readonly JwtRole[]).includes(role)
}

export async function requireLibraryActor(connection: Pick<PoolConnection, 'execute'>, accountId: number, permission: LibraryPermission) {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT a.role,a.account_status,u.account_status AS user_status
    FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`, [accountId])
  const account = rows[0]
  if (!account || account.account_status !== 'Active' || (account.user_status && account.user_status !== 'Active')
    || !hasLibraryPermission(account.role as JwtRole, permission)) {
    throw new HttpError(403, 'JWT_ROLE_FORBIDDEN', 'Your account cannot perform this action.')
  }
}
