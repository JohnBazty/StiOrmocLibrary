import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { LANGUAGES, STRINGS, type Lang } from './i18n'
import { useIdleReset } from './useIdleReset'
import { KioskLogin } from './KioskLogin'
import { hasKioskSession, kioskLogout } from './kiosk-session'
import { AttendanceFlow } from './AttendanceFlow'
import { BorrowFlow } from './BorrowFlow'

const KIOSK_ROOT = '/kiosk'

function TaskPlaceholder({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <SectionCard>
      <h2>{title}</h2>
      <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
    </SectionCard>
  )
}

function LanguageNav({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <nav aria-label="Language" className="flex gap-2 justify-end">
      {LANGUAGES.map(({ code, label }) => (
        <Button key={code} variant={code === lang ? 'primary' : 'ghost'} onClick={() => onChange(code)}>
          {label}
        </Button>
      ))}
    </nav>
  )
}

export function KioskApp({ idleMs = 60000 }: { idleMs?: number }) {
  const [lang, setLang] = useState<Lang>('en')
  const [authed, setAuthed] = useState(() => hasKioskSession())
  const t = STRINGS[lang]
  const navigate = useNavigate()
  const location = useLocation()
  const onIdle = location.pathname !== KIOSK_ROOT

  useIdleReset(idleMs, () => navigate(KIOSK_ROOT), onIdle && authed)

  const goHome = () => navigate(KIOSK_ROOT)
  const endSession = () => { kioskLogout(); setAuthed(false); navigate(KIOSK_ROOT) }

  if (!authed) {
    return (
      <div className="min-h-screen p-6">
        <LanguageNav lang={lang} onChange={setLang} />
        <KioskLogin lang={lang} onSuccess={() => setAuthed(true)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={endSession}>{t.endSession}</Button>
        <LanguageNav lang={lang} onChange={setLang} />
      </div>
      <Routes>
        <Route
          index
          element={
            <SectionCard>
              <h1>{t.welcome}</h1>
              <p>{t.tapToBegin}</p>
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate('attendance')}>{t.attendance}</Button>
                <Button onClick={() => navigate('borrow')}>{t.borrow}</Button>
                <Button onClick={() => navigate('search')}>{t.search}</Button>
              </div>
            </SectionCard>
          }
        />
        <Route path="attendance" element={<AttendanceFlow lang={lang} onDone={goHome} />} />
        <Route path="borrow" element={<BorrowFlow lang={lang} onDone={goHome} />} />
        <Route path="search" element={<TaskPlaceholder title={t.search} onBack={goHome} backLabel={t.back} />} />
      </Routes>
    </div>
  )
}
