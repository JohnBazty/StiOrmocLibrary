import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { STRINGS, type Lang } from './i18n'
import { blockMessageFor, kioskLogin } from './kiosk-session'

export function KioskLogin({ lang, onSuccess }: { lang: Lang; onSuccess: () => void }) {
  const t = STRINGS[lang]
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await kioskLogin(schoolId.trim(), password)
      onSuccess()
    } catch (err) {
      setError(blockMessageFor(err, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard>
      <h1>{t.signInTitle}</h1>
      <p>{t.signInHint}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block font-bold">{t.schoolId}
          <input value={schoolId} onChange={e => setSchoolId(e.target.value)} autoComplete="off"
            className="mt-1 w-full rounded-xl border border-[#003399]/20 bg-white p-3 text-[#003399]" />
        </label>
        <label className="block font-bold">{t.password}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off"
            className="mt-1 w-full rounded-xl border border-[#003399]/20 bg-white p-3 text-[#003399]" />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{t.signIn}</Button>
      </form>
    </SectionCard>
  )
}
