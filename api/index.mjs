import { createApp } from '../apps/api/dist/app.js'

// Vercel routes every /api/* request here. The rewrite carries the original
// path so Express sees exactly the same URL it receives in local development.
const app = createApp()

export default function handler(request, response) {
  const url = new URL(request.url, 'http://localhost')
  const route = url.searchParams.get('__api_route')
  if (route !== null) {
    url.searchParams.delete('__api_route')
    request.url = `/api/${route}${url.search}`
  }
  return app(request, response)
}
