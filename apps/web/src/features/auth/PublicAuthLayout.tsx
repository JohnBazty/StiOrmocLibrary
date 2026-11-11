import { useEffect, useRef, useState, createContext, useContext } from 'react'
import { ArrowLeft, LibraryBig, X } from 'lucide-react'
import { Link, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { PublicCatalogPage } from '../catalog/PublicCatalogPage'
import { catalogAuthLink } from '../catalog/catalog-login-continuation'

const PopupBusyContext = createContext<((busy: boolean) => void) | null>(null)

export function useAuthPopupBusy(busy: boolean) {
  const setBusy = useContext(PopupBusyContext)
  useEffect(() => {
    setBusy?.(busy)
    return () => setBusy?.(false)
  }, [busy, setBusy])
}

/** Native modal behavior traps focus and makes the catalog behind it inert. */
export function PublicAuthLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const registration = location.pathname === '/register'
  const saved = location.state?.catalogLocation
  const catalogLocation = saved?.pathname === '/'
    ? { pathname: '/', search: typeof saved.search === 'string' ? saved.search : '', hash: typeof saved.hash === 'string' ? saved.hash : '' }
    : { pathname: '/', search: '', hash: '#catalog' }
  const returnTo = `${catalogLocation.pathname}${catalogLocation.search}${catalogLocation.hash}`
  const close = () => { if (!busy) navigate(returnTo, { replace: true }) }

  useEffect(() => {
    const modal = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal?.showModal()
    modal?.querySelector<HTMLInputElement>('input')?.focus()
    return () => {
      modal?.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return <>
    <Routes location={catalogLocation}><Route path="/" element={<PublicCatalogPage />} /></Routes>
    <dialog ref={dialog} aria-labelledby="auth-form-heading" className={`public-auth-dialog ${registration ? 'public-auth-dialog-wide' : ''}`}
      onCancel={event => { event.preventDefault(); close() }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
      }}>
      <div className="h-1.5 bg-[#FFF200]" />
      <div className="public-auth-content">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig size={24} /></span><div><p className="text-sm font-black tracking-tight">STI COLLEGE ORMOC</p><p className="text-[10px] font-bold uppercase tracking-[.18em] opacity-55">ILMS</p></div></div>
          <button type="button" disabled={busy} onClick={close} aria-label="Close account dialog" className="rounded-full border border-current/10 p-2 opacity-65 transition hover:bg-[#003399]/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30 dark:hover:bg-white/10"><X size={19} /></button>
        </header>
        <nav aria-label="Account access" className="public-auth-tabs">
          {(['/login', '/register'] as const).map(path => <Link key={path} to={catalogAuthLink(path, location.search)} state={location.state}
            aria-current={location.pathname === path ? 'page' : undefined} aria-disabled={busy || undefined}
            onClick={event => { if (busy) event.preventDefault() }}
            className={location.pathname === path ? 'public-auth-tab-active' : ''}>{path === '/login' ? 'Sign In' : 'Sign Up'}</Link>)}
        </nav>
        <PopupBusyContext.Provider value={setBusy}><Outlet /></PopupBusyContext.Provider>
        <footer className="mt-6 border-t border-[#003399]/10 pt-4 dark:border-white/10"><Link to={returnTo} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold opacity-65 transition hover:bg-[#003399]/5 hover:opacity-100 dark:hover:bg-white/10"><ArrowLeft size={15} />Back to browsing</Link></footer>
      </div>
    </dialog>
  </>
}
