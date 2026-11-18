import { Router } from 'express'

// Preserve the editor and version history for restoration. Circulation still
// resolves the saved policies directly through borrowing-policy.service.ts.
export const archivedBorrowingPolicyRouter = Router()
archivedBorrowingPolicyRouter.use((_request, response) => {
  response.set('Cache-Control', 'no-store').status(410).json({
    success: false,
    code: 'BORROWING_POLICY_MANAGEMENT_ARCHIVED',
    message: 'Borrowing policy management is temporarily archived. Saved borrowing rules still apply.',
  })
})
