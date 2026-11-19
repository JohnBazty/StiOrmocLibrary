import { useState } from 'react'
import { LibraryBig, LogOut, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearAuthSession, getCurrentClaims, type AuthRole } from './auth-storage'

export function RoleDashboardPage({ role }: { role: Extract<AuthRole, 'Librarian' | 'Faculty'> }) {
  const navigate = useNavigate()
  const claims = getCurrentClaims()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const signOut = () => {
    clearAuthSession()
    setConfirmSignOut(false)
    navigate('/login', { replace: true })
  }
  return <main className="min-h-screen bg-[#FFFFFF] text-[#0b5ea2]"><header className="flex items-center justify-between bg-[#0b5ea2] px-5 py-4 text-[#FFFFFF] sm:px-10"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF200] text-[#0b5ea2]"><LibraryBig size={21} /></span><div><p className="font-display font-black">STI College Ormoc ILMS</p><p className="text-xs text-[#FFFFFF]/65">{role} portal</p></div></div><button onClick={() => setConfirmSignOut(true)} className="flex items-center gap-2 rounded-xl border border-[#FFFFFF]/25 px-4 py-2 text-sm font-bold"><LogOut size={16} /> Sign out</button></header><section className="mx-auto max-w-5xl p-6 sm:p-10"><div className="rounded-3xl bg-[#0b5ea2] p-8 text-[#FFFFFF] sm:p-12"><ShieldCheck className="text-[#FFF200]" size={36} /><p className="mt-7 text-sm font-bold uppercase tracking-[.16em] text-[#FFF200]">Authorized workspace</p><h1 className="mt-3 font-display text-4xl font-black">Welcome to your {role.toLowerCase()} dashboard.</h1><p className="mt-4 text-sm font-bold text-[#FFFFFF]/70">{claims?.schoolId}</p></div></section>{confirmSignOut ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b5ea2]/80 p-4" onKeyDown={(event) => { if (event.key === 'Escape') setConfirmSignOut(false) }}><div role="alertdialog" aria-modal="true" aria-labelledby="role-sign-out-title" aria-describedby="role-sign-out-text" className="w-full max-w-md rounded-2xl bg-white p-5 text-[#0b5ea2] shadow-2xl"><h2 id="role-sign-out-title" className="text-lg font-black">Are you sure you want to sign out?</h2><p id="role-sign-out-text" className="mt-2 text-sm opacity-75">You will need to sign in again to use this portal.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirmSignOut(false)} className="h-11 rounded-xl border border-[#0b5ea2] px-4 text-sm font-bold">Cancel</button><button type="button" onClick={signOut} className="h-11 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white">Sign out now</button></div></div></div> : null}</main>
}
