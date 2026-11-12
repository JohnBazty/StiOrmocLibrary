import { Navigate, useLocation } from 'react-router-dom'

export function LegacyCatalogRedirect() {
  const location = useLocation()
  return <Navigate replace to={`${location.pathname.replace(/\/catalog$/, '/library')}${location.search}${location.hash}`} />
}
