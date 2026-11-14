import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { catalogAuthLink } from '../catalog/catalog-login-continuation'
import { AuthMessage } from './AuthMessage'
import { useAuthPopupBusy } from './PublicAuthLayout'
import { rosterRegistrationRequest } from './auth-api'
import { RosterRegistrationForm } from './RosterRegistrationForm'

const fieldClass = 'h-12 w-full rounded-xl border border-catalog-brand/20 bg-[#FFFFFF] px-4 text-sm text-catalog-brand outline-none transition placeholder:text-catalog-brand/40 focus:border-catalog-brand focus:ring-4 focus:ring-catalog-brand/10'

export function RegistrationPage({ popup = false }: { popup?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const loginLink = catalogAuthLink('/login', location.search)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'loading' | 'open' | 'closed' | 'unavailable'>('loading')
  const [retry, setRetry] = useState(0)
  useAuthPopupBusy(busy)

  useEffect(() => {
    const controller = new AbortController()
    rosterRegistrationRequest<{ enabled: boolean; open: boolean }>('', undefined, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setMode(result.enabled ? result.open ? 'open' : 'closed' : 'unavailable')
      })
      .catch(() => { if (!controller.signal.aborted) setMode('unavailable') })
    return () => controller.abort()
  }, [retry])

  return (
    <div className={popup ? 'public-auth-form' : 'public-library-reference reference-registration-page min-h-screen bg-catalog-brand px-4 py-8 sm:px-6 lg:py-12'}>
      <div className={popup ? '' : 'mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[#FFFFFF] shadow-2xl shadow-catalog-brand lg:grid lg:grid-cols-[.78fr_1.22fr]'}>
        {!popup && <section className="reference-auth-hero relative overflow-hidden bg-catalog-brand p-8 text-[#FFFFFF] lg:p-10">
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border-[55px] border-[#FFF200]/10" />
          <div className="relative flex items-center gap-3"><img src="/reference-logo.jpg" alt="STI College Ormoc Logo" width={48} height={48} className="h-12 w-12 rounded-xl object-contain" /><div><p className="font-display text-lg font-black">STI COLLEGE ORMOC</p><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">Online Library</p></div></div>
          <div className="relative mt-14"><p className="text-xs font-black uppercase tracking-[.2em] text-[#FFF200]">Campus access</p><h1 className="mt-4 font-display text-4xl font-black leading-tight">Create your library account.</h1></div>
          <div className="relative mt-10 rounded-2xl border border-[#FFF200]/35 bg-[#FFF200]/10 p-5 text-sm leading-6 text-[#FFFFFF]/80"><strong className="block text-[#FFF200]">Already registered?</strong><Link to={loginLink} state={location.state} className="mt-1 inline-flex font-bold text-[#FFFFFF] underline underline-offset-4">Return to Login</Link></div>
        </section>}

        <section className={popup ? '' : 'p-6 sm:p-10'}>
          {!popup && <p className="text-xs font-black uppercase tracking-[.18em] text-catalog-brand/55">New account</p>}<h2 id={popup ? 'auth-form-heading' : undefined} className="mt-2 font-display text-3xl font-black tracking-tight text-catalog-brand">Account Registration</h2>
          {popup && <p className="mt-2 text-sm leading-relaxed opacity-65">Join your campus library. Verify your school email to get started.</p>}
          {mode === 'open' && <RosterRegistrationForm fieldClass={fieldClass} busy={busy} onBusy={setBusy}
            onComplete={schoolId => navigate(loginLink, { replace: true, state: { ...location.state, registrationSuccess: true, registrationSchoolId: schoolId } })} />}
          {mode === 'loading' && <p className="mt-4 text-sm" role="status">Checking whether Student registration is open…</p>}
          {mode === 'closed' && <p className="mt-4 text-sm" role="status">Student registration opens when the library starts the semester. If you already have an account, sign in below.</p>}
          {mode === 'unavailable' && <AuthMessage error>Student registration is temporarily unavailable. <button type="button" className="font-bold underline" onClick={() => { setMode('loading'); setRetry(value => value + 1) }}>Try again</button></AuthMessage>}
          <p className="mt-5 text-sm">Staff accounts are set up by the library. New Faculty signup is currently unavailable.</p>
          {!popup && <p className="mt-6 text-center text-sm text-catalog-brand/65">Already registered? <Link to={loginLink} state={location.state} onClick={event => { if (busy) event.preventDefault() }} className="font-black text-catalog-brand underline decoration-[#FFF200] decoration-4 underline-offset-4">Sign In Here</Link></p>}
        </section>
      </div>
    </div>
  )
}
