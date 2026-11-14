/** Strip only the internal rewrite metadata before handing a request to Express. */
export function normalizeVercelRequest(request) {
  const url = new URL(request.url, 'http://localhost')
  const route = url.searchParams.get('__api_route')
  if (route !== null) {
    url.searchParams.delete('__api_route')
    request.url = `/api/${route}${url.search}`
  }
  // Remove the hosting helper itself, rather than mutating a value returned
  // by its getter. Express must parse the normalized URL with its own parser.
  const query = Object.getOwnPropertyDescriptor(request, 'query')
  if (query?.configurable) {
    delete request.query
  }
}
