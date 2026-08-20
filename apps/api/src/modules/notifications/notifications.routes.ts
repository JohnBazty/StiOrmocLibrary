import { notifications } from '../../data/mock-data.ts'
import { createResourceRouter } from '../../core/create-resource-router.ts'

export const notificationsRouter = createResourceRouter(notifications)
