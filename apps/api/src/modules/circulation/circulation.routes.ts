import { borrowTransactions } from '../../data/mock-data.ts'
import { createResourceRouter } from '../../core/create-resource-router.ts'

export const circulationRouter = createResourceRouter(borrowTransactions)
