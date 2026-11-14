/** Strip only the internal rewrite metadata before handing a request to Express. */
export function normalizeVercelRequest(request) {
  const url = new URL(request.url, 'http://localhost')
  const route = url.searchParams.get('__api_route')
  if (route !== null) {
    url.searchParams.delete('__api_route')
    request.url = `/api/${route}${url.search}`
  }
  // Vercel also provides a pre-parsed own `query` property. Updating the URL
  // alone leaves its rewrite key visible to strict application validators.
  if (request.query && typeof request.query === 'object' && !Array.isArray(request.query)) {
    delete request.query.__api_route
  }
}
