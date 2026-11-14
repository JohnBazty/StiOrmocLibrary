// Navigation only. No credentials, school database, payment capture or API proxy.
export default function paymentReturn(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD'); response.statusCode = 405
    response.end('Use the payment return link.'); return
  }
  const url = new URL(request.url, 'https://payment-return.invalid')
  const values = url.searchParams.getAll('payment')
  if (values.length !== 1 || [...url.searchParams.keys()].some(key => key !== 'payment')
    || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(values[0])) {
    response.statusCode = 400; response.end('Choose a valid payment reference.'); return
  }
  // Fixed destination: this endpoint can never redirect to a caller-supplied site.
  response.statusCode = 303
  response.setHeader('Location', 'http://localhost:5173/payments/result?payment=' + values[0].toLowerCase())
  response.end(request.method === 'HEAD' ? undefined : 'Returning to your payment.')
}
