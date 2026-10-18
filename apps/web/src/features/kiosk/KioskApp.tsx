import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, CalendarCheck, Search } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { LANGUAGES, STRINGS, type Lang } from './i18n'
import { useIdleReset } from './useIdleReset'
import { KioskLogin } from './KioskLogin'
import { hasKioskSession, kioskLogout } from './kiosk-session'
import { AttendanceFlow } from './AttendanceFlow'
import { BorrowFlow } from './BorrowFlow'
import { SearchFlow } from './SearchFlow'
import './kiosk.css'

const KIOSK_ROOT = '/kiosk'

function LanguageNav({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <nav aria-label="Language" className="flex gap-2 justify-end">
      {LANGUAGES.map(({ code, label }) => (
        <Button key={code} variant={code === lang ? 'primary' : 'secondary'} onClick={() => onChange(code)}>
          {label}
        </Button>
      ))}
    </nav>
  )
}

export function KioskApp({ idleMs = 60000, warnMs = 20000 }: { idleMs?: number; warnMs?: number }) {
  const [lang, setLang] = useState<Lang>('en')
  const [authed, setAuthed] = useState(() => hasKioskSession())
  const t = STRINGS[lang]
  const navigate = useNavigate()
  const location = useLocation()
  const inTask = location.pathname !== KIOSK_ROOT

  const goHome = () => navigate(KIOSK_ROOT)
  const stillThere = useIdleReset(idleMs, goHome, inTask && authed, warnMs)
  const endSession = () => {
    if (!window.confirm(t.endSessionConfirm)) return
    kioskLogout()
    setAuthed(false)
    navigate(KIOSK_ROOT)
  }

  if (!authed) {
    return (
      <div className="kiosk-root p-6">
        <LanguageNav lang={lang} onChange={setLang} />
        <KioskLogin lang={lang} onSuccess={() => setAuthed(true)} />
      </div>
    )
  }

  return (
    <div className="kiosk-root p-6">
      <div className="flex justify-between items-center gap-3 mb-4">
        {inTask ? <Button variant="secondary" onClick={goHome}><ArrowLeft aria-hidden size={24} />{t.back}</Button> : <span />}
        <LanguageNav lang={lang} onChange={setLang} />
      </div>
      <Routes>
        <Route
          index
          element={
            <SectionCard>
              <h1>{t.welcome}</h1>
              <p className="mb-4">{t.tapToBegin}</p>
              <div className="flex flex-col gap-4">
                <Button className="kiosk-big" onClick={() => navigate('attendance')}><CalendarCheck aria-hidden size={32} />{t.attendance}</Button>
                <Button className="kiosk-big" onClick={() => navigate('borrow')}><BookOpen aria-hidden size={32} />{t.borrow}</Button>
                <Button className="kiosk-big" onClick={() => navigate('search')}><Search aria-hidden size={32} />{t.search}</Button>
              </div>
            </SectionCard>
          }
        />
        <Route path="attendance" element={<AttendanceFlow lang={lang} onDone={goHome} />} />
        <Route path="borrow" element={<BorrowFlow lang={lang} onDone={goHome} />} />
        <Route path="search" element={<SearchFlow lang={lang} />} />
      </Routes>
      {!inTask && (
        <footer className="mt-10 flex justify-end">
          <Button variant="ghost" onClick={endSession}>{t.endSession}</Button>
        </footer>
      )}
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
