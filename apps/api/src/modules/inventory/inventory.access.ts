import { requireRoles } from '../auth/auth.middleware.js'
import { ROLES, STAFF_ROLES } from '../auth/auth.constants.js'

const librarianOnly = requireRoles(ROLES.LIBRARIAN)
const staffOrLibrarian = requireRoles(...STAFF_ROLES)

// Stocktakes are open to Library Staff (finer split lives in stocktake.routes.ts); the rest of inventory is Librarian-only.
export const inventoryAccessGuard: typeof librarianOnly = (request, response, next) => (
  /^\/stocktakes(\/|$)/.test(request.path) ? staffOrLibrarian(request, response, next) : librarianOnly(request, response, next)
)
