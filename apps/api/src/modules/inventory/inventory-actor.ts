import type { Request, Response } from 'express'

export type InventoryRequestActor = { userId: number | null; label: string }

export function inventoryActor(request: Request, response: Response): InventoryRequestActor {
  const authenticated = response.locals.authenticatedUser as {
    userId?: number
    id?: number
    fullName?: string
    email?: string
    schoolId?: string
  } | undefined
  const sessionUser = request.session?.user as { id?: number; fullName?: string; email?: string } | undefined
  // JWT identities use accounts.account_id in `id`, while audit foreign keys
  // reference users.user_id. Store the label but leave the FK null unless an
  // explicit operational userId is available.
  const rawId = authenticated?.userId ?? (authenticated ? undefined : sessionUser?.id)
  return {
    userId: Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : null,
    label: authenticated?.fullName ?? authenticated?.email ?? authenticated?.schoolId
      ?? sessionUser?.fullName ?? sessionUser?.email ?? 'admin_authenticated',
  }
}
