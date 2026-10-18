import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { LANGUAGES, STRINGS, type Lang } from './i18n'
import { useIdleReset } from './useIdleReset'

const KIOSK_ROOT = '/kiosk'

function TaskPlaceholder({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <SectionCard>
      <h2>{title}</h2>
      <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
    </SectionCard>
  )
}

export function KioskApp({ idleMs = 60000 }: { idleMs?: number }) {
  const [lang, setLang] = useState<Lang>('en')
  const t = STRINGS[lang]
  const navigate = useNavigate()
  const location = useLocation()
  const onIdle = location.pathname !== KIOSK_ROOT

  useIdleReset(idleMs, () => navigate(KIOSK_ROOT), onIdle)

  const goHome = () => navigate(KIOSK_ROOT)

  return (
    <div className="min-h-screen p-6">
      <nav aria-label="Language" className="flex gap-2 justify-end">
        {LANGUAGES.map(({ code, label }) => (
          <Button key={code} variant={code === lang ? 'primary' : 'ghost'} onClick={() => setLang(code)}>
            {label}
          </Button>
        ))}
      </nav>
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
        <Route path="attendance" element={<TaskPlaceholder title={t.attendance} onBack={goHome} backLabel={t.back} />} />
        <Route path="borrow" element={<TaskPlaceholder title={t.borrow} onBack={goHome} backLabel={t.back} />} />
        <Route path="search" element={<TaskPlaceholder title={t.search} onBack={goHome} backLabel={t.back} />} />
      </Routes>
    </div>
  )
}
