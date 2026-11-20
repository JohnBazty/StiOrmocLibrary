/** Strip only the internal rewrite metadata before handing a request to Express. */
export function normalizeVercelRequest(request) {
  const rawUrl = String(request.url ?? '')
  const queryIndex = rawUrl.indexOf('?')
  if (queryIndex !== -1) {
    const rawQuery = rawUrl.slice(queryIndex + 1)
    let rawRoute = null
    const keptParts = []
    for (const part of rawQuery.split('&')) {
      if (!part) continue
      const eq = part.indexOf('=')
      const key = eq === -1 ? part : part.slice(0, eq)
      if (key === '__api_route' && rawRoute === null) {
        rawRoute = eq === -1 ? '' : part.slice(eq + 1)
      } else {
        keptParts.push(part)
      }
    }
    if (rawRoute !== null) {
      let decodedRoute = rawRoute
      try { decodedRoute = decodeURIComponent(rawRoute) } catch { /* retain raw if malformed */ }
      const safePath = decodedRoute
        .replace(/^\/+/, '')
        .split('/')
        .map(segment => {
          let decodedSegment = segment
          try { decodedSegment = decodeURIComponent(segment) } catch { /* keep segment literal */ }
          return encodeURIComponent(decodedSegment)
        })
        .join('/')
      const suffix = keptParts.length ? `?${keptParts.join('&')}` : ''
      request.url = `/api/${safePath}${suffix}`
    }
  }
  // Remove the hosting helper itself, rather than mutating a value returned
  // by its getter. Express must parse the normalized URL with its own parser.
  const query = Object.getOwnPropertyDescriptor(request, 'query')
  if (query?.configurable) {
    delete request.query
  }
}
