import { useState } from 'react'
import { Button } from '../../components/ui'
import { usersApi } from './users-api'

type Action = 'unlock' | 'temporary'
const field = 'mt-1 w-full rounded-xl border border-[#003399]/20 px-3 py-2 text-sm'

/** Admin unlock (S3) and temporary password (S5) for one account; both need an audit reason. */
export function SignInAccessPanel({ accountId, onChanged }: { accountId: number; onChanged: () => void }) {
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')

  async function confirm() {
    if (!action) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'unlock') {
        await usersApi.unlockSignIn(accountId, reason)
        setNotice('Sign-in unlocked. The account can try again now.')
      } else {
        setTemporaryPassword((await usersApi.setTemporaryPassword(accountId, reason)).temporary_password)
      }
      setAction(null); setReason('')
      onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sign-in action failed.') }
    finally { setBusy(false) }
  }

  return <div className="mt-6 border-t border-[#003399]/15 pt-5">
    <h3 className="font-bold">Sign-in access</h3>
    <p className="mt-1 text-sm">Unlock an account paused after 5 wrong passwords, or set a temporary password for an account that cannot use the email reset. A temporary password ends all sign-ins and must be changed at the next sign-in.</p>
    {error && <p role="alert" className="mt-3 rounded-xl bg-[#FFF200] p-3 text-sm font-bold">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-xl border border-[#003399]/20 p-3 text-sm font-bold">{notice}</p>}
    {temporaryPassword && <div role="status" className="mt-3 rounded-xl border-2 border-[#003399] p-4">
      <p className="text-sm font-bold">Temporary password (shown once)</p>
      <p className="mt-2 select-all font-mono text-lg tracking-wider">{temporaryPassword}</p>
      <p className="mt-2 text-xs">Give it to the account owner in person. It is not stored and cannot be shown again.</p>
      <div className="mt-3"><Button variant="secondary" onClick={() => setTemporaryPassword('')}>Done</Button></div>
    </div>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={() => { setAction('unlock'); setReason(''); setTemporaryPassword('') }} className="rounded-xl border border-[#003399] px-3 py-2 text-sm font-bold">Unlock sign-in</button>
      <button onClick={() => { setAction('temporary'); setReason(''); setTemporaryPassword('') }} className="rounded-xl border border-[#003399] px-3 py-2 text-sm font-bold">Set temporary password</button>
    </div>
    {action && <div className="mt-4 rounded-xl border border-[#003399]/20 p-4">
      <p className="font-bold">{action === 'unlock' ? 'Confirm unlock' : 'Confirm temporary password'}</p>
      <label className="mt-2 block text-xs font-bold">Audit reason<input className={field} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder="Why is this needed?" /></label>
      <div className="mt-3 flex gap-2"><Button disabled={busy || reason.trim().length < 3} onClick={() => void confirm()}>Confirm</Button><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button></div>
    </div>}
  </div>
}
