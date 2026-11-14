import { createApp } from '../apps/api/dist/app.js'
import { normalizeVercelRequest } from '../apps/api/dist/core/vercel-request.js'

// Vercel routes every /api/* request here. The rewrite carries the original
// path so Express sees exactly the same URL it receives in local development.
const app = createApp()

export default function handler(request, response) {
  normalizeVercelRequest(request)
  return app(request, response)
}
