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

// Light/Dark toggle plus one Language control (the native picker is large and familiar on tablets).
function Preferences({ lang, onLang, theme, onTheme }: { lang: Lang; onLang: (lang: Lang) => void; theme: Theme; onTheme: (theme: Theme) => void }) {
  const t = STRINGS[lang]
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun aria-hidden size={24} /> : <Moon aria-hidden size={24} />}
        {theme === 'dark' ? t.lightMode : t.darkMode}
      </Button>
      <label className="kiosk-lang">
        <Globe aria-hidden size={24} />
        <select aria-label="Language" value={lang} onChange={e => onLang(e.target.value as Lang)}>
          {LANGUAGES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </select>
      </label>
    </div>
  )
}

export function KioskApp({ idleMs = 60000, warnMs = 20000 }: { idleMs?: number; warnMs?: number }) {
  const [lang, setLang] = useState<Lang>('en')
  const [theme, setTheme] = useState<Theme>('dark')
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
      <div className={`kiosk-root p-6 ${theme === 'dark' ? 'dark' : 'kiosk-light'}`}>
        <Preferences lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />
        <KioskLogin lang={lang} notice={signedOut ? t.signedOut : undefined} onSuccess={() => { setSignedOut(false); setAuthed(true) }} />
      </div>
    )
  }

  return (
    <div className={`kiosk-root p-6 ${theme === 'dark' ? 'dark' : 'kiosk-light'}`}>
      <div className="flex justify-between items-center gap-3 mb-4">
        {inTask ? <Button variant="secondary" onClick={goHome}><ArrowLeft aria-hidden size={24} />{t.back}</Button> : <span />}
        <Preferences lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />
      </div>
      <Routes>
        <Route
          index
          element={
            <SectionCard>
              <h1 className="select-none" onPointerDown={startHold} onPointerUp={cancelHold} onPointerLeave={cancelHold} onContextMenu={e => e.preventDefault()}>{t.welcome}</h1>
              <p className="mb-4">{t.tapToBegin}</p>
              <div className="flex flex-col gap-4">
                <Button className="kiosk-big" onClick={() => navigate('attendance')}><CalendarCheck aria-hidden size={32} />{t.attendance}</Button>
                <Button className="kiosk-big" onClick={() => navigate('borrow')}><BookOpen aria-hidden size={32} />{t.borrow}</Button>
                <Button className="kiosk-big" onClick={() => navigate('search')}><Search aria-hidden size={32} />{t.search}</Button>
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
