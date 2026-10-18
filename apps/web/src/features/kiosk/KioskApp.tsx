import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, CalendarCheck, Globe, Moon, Search, Sun } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { LANGUAGES, STRINGS, type Lang } from './i18n'
import { useIdleReset } from './useIdleReset'
import { KioskLogin } from './KioskLogin'
import { hasKioskSession, kioskLogout, renewKioskSession } from './kiosk-session'
import { applyTheme, readStoredTheme } from '../theme/ThemeProvider'
import { KioskStaffExit } from './KioskStaffExit'
import { AttendanceFlow } from './AttendanceFlow'
import { BorrowFlow } from './BorrowFlow'
import { SearchFlow } from './SearchFlow'
import './kiosk.css'

const KIOSK_ROOT = '/kiosk'
// Staff open the end-session panel by holding the welcome heading; students never see a button.
const STAFF_HOLD_MS = 3000
// Renew well inside the server's 10-minute idle window so one missed renewal doesn't sign the kiosk out.
const KEEP_ALIVE_MS = 4 * 60_000

type Theme = 'dark' | 'light'

// One Language control; the native picker is large and familiar on tablets.
function LanguageSelect({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <label className="kiosk-lang">
      <Globe aria-hidden size={24} />
      <select aria-label="Language" value={lang} onChange={e => onLang(e.target.value as Lang)}>
        {LANGUAGES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  )
}

// Text size (A+ / A) and Light/Dark.
function DisplayToggles({ lang, large, onLarge, theme, onTheme }: { lang: Lang; large: boolean; onLarge: (large: boolean) => void; theme: Theme; onTheme: (theme: Theme) => void }) {
  const t = STRINGS[lang]
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => onLarge(!large)}>
        <span aria-hidden>{large ? 'A' : 'A+'}</span><span className="sr-only">{large ? t.normalText : t.largerText}</span>
      </Button>
      <Button variant="secondary" onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun aria-hidden size={24} /> : <Moon aria-hidden size={24} />}
        {theme === 'dark' ? t.lightMode : t.darkMode}
      </Button>
    </div>
  )
}

export function KioskApp({ idleMs = 60000, warnMs = 20000 }: { idleMs?: number; warnMs?: number }) {
  const [lang, setLang] = useState<Lang>('en')
  const [theme, setTheme] = useState<Theme>('dark')
  const [large, setLarge] = useState(false)
  const [authed, setAuthed] = useState(() => hasKioskSession())
  const [staffExit, setStaffExit] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const startHold = () => { holdTimer.current = setTimeout(() => setStaffExit(true), STAFF_HOLD_MS) }
  const cancelHold = () => clearTimeout(holdTimer.current)
  const t = STRINGS[lang]
  const navigate = useNavigate()
  const location = useLocation()
  const inTask = location.pathname !== KIOSK_ROOT

  const goHome = () => navigate(KIOSK_ROOT)
  const stillThere = useIdleReset(idleMs, goHome, inTask && authed, warnMs)
  const endSession = () => {
    kioskLogout()
    setStaffExit(false)
    setAuthed(false)
    navigate(KIOSK_ROOT)
  }
  // The server ended the desk session (expiry, 10 idle minutes, revoked): tell whoever is at the kiosk.
  const sessionLost = () => { setSignedOut(true); endSession() }

  // The kiosk owns its theme. The portal's dark mode (html.dark) brings global !important
  // overrides that would repaint the kiosk navy, so keep it off while the kiosk is shown
  // (ThemeProvider may re-add it after mount) and restore the portal's saved theme on exit.
  useEffect(() => {
    const html = document.documentElement
    const strip = () => { if (html.classList.contains('dark')) html.classList.remove('dark') }
    strip()
    const observer = new MutationObserver(strip)
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => { observer.disconnect(); applyTheme(readStoredTheme()) }
  }, [])

  useEffect(() => {
    if (!authed) return
    let stopped = false
    const renew = async () => { if ((await renewKioskSession()) === 'lost' && !stopped) sessionLost() }
    void renew()
    const timer = setInterval(renew, KEEP_ALIVE_MS)
    return () => { stopped = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  if (!authed) {
    return (
      <div className={`kiosk-root p-6 ${theme === 'dark' ? 'dark' : 'kiosk-light'}${large ? ' kiosk-large' : ''}`}>
        <div className="kiosk-topbar">
          <LanguageSelect lang={lang} onLang={setLang} />
          <DisplayToggles lang={lang} large={large} onLarge={setLarge} theme={theme} onTheme={setTheme} />
        </div>
        <KioskLogin lang={lang} notice={signedOut ? t.signedOut : undefined} onSuccess={() => { setSignedOut(false); setAuthed(true) }} />
      </div>
    )
  }

  return (
    <div className={`kiosk-root p-6 ${theme === 'dark' ? 'dark' : 'kiosk-light'}${large ? ' kiosk-large' : ''}`}>
      <div className="kiosk-topbar">
        {inTask ? <Button variant="secondary" onClick={goHome}><ArrowLeft aria-hidden size={24} />{t.back}</Button> : <LanguageSelect lang={lang} onLang={setLang} />}
        <div className="flex gap-2">
          {inTask && <LanguageSelect lang={lang} onLang={setLang} />}
          <DisplayToggles lang={lang} large={large} onLarge={setLarge} theme={theme} onTheme={setTheme} />
        </div>
      </div>
      <Routes>
        <Route
          index
          element={
            <SectionCard className="kiosk-home">
              <h1 className="select-none" onPointerDown={startHold} onPointerUp={cancelHold} onPointerLeave={cancelHold} onContextMenu={e => e.preventDefault()}>{t.welcome}</h1>
              <p className="kiosk-greeting">{t.tapToBegin}</p>
              <div className="kiosk-tiles">
                <button type="button" className="kiosk-tile" onClick={() => navigate('attendance')}>
                  <span className="kiosk-tile-icon kiosk-tile-teal" aria-hidden><CalendarCheck size={40} /></span>{t.attendance}
                </button>
                <button type="button" className="kiosk-tile" onClick={() => navigate('borrow')}>
                  <span className="kiosk-tile-icon kiosk-tile-yellow" aria-hidden><BookOpen size={40} /></span>{t.borrow}
                </button>
                <button type="button" className="kiosk-tile" onClick={() => navigate('search')}>
                  <span className="kiosk-tile-icon kiosk-tile-green" aria-hidden><Search size={40} /></span>{t.search}
                </button>
              </div>
            </SectionCard>
          }
        />
        <Route path="attendance" element={<AttendanceFlow lang={lang} onDone={goHome} onSessionLost={sessionLost} />} />
        <Route path="borrow" element={<BorrowFlow lang={lang} onDone={goHome} onSessionLost={sessionLost} />} />
        <Route path="search" element={<SearchFlow lang={lang} />} />
      </Routes>
      {staffExit && <KioskStaffExit lang={lang} onCancel={() => setStaffExit(false)} onVerified={endSession} />}
      {stillThere && (
        // Any tap is activity: the idle hook restarts the timer and hides this.
        <div role="alertdialog" aria-modal="true" aria-labelledby="kiosk-still-there" className="kiosk-overlay">
          <SectionCard className="text-center">
            <h2 id="kiosk-still-there">{t.stillThere}</h2>
            <p className="my-4">{t.stillThereHint}</p>
            <Button className="kiosk-big w-full">{t.continue}</Button>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
