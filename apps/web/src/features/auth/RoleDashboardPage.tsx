import { LibraryBig, LogOut, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearAccessToken, getCurrentClaims, type AuthRole } from './auth-storage'

export function RoleDashboardPage({ role }: { role: Extract<AuthRole, 'Librarian' | 'Faculty'> }) {
  const navigate = useNavigate()
  const claims = getCurrentClaims()
  return <main className="min-h-screen bg-[#FFFFFF] text-[#003399]"><header className="flex items-center justify-between bg-[#003399] px-5 py-4 text-[#FFFFFF] sm:px-10"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><LibraryBig size={21} /></span><div><p className="font-display font-black">STI Ormoc Smart Library</p><p className="text-xs text-[#FFFFFF]/65">{role} portal</p></div></div><button onClick={() => { clearAccessToken(); navigate('/login', { replace: true }) }} className="flex items-center gap-2 rounded-xl border border-[#FFFFFF]/25 px-4 py-2 text-sm font-bold"><LogOut size={16} /> Sign out</button></header><section className="mx-auto max-w-5xl p-6 sm:p-10"><div className="rounded-3xl bg-[#003399] p-8 text-[#FFFFFF] sm:p-12"><ShieldCheck className="text-[#FFF200]" size={36} /><p className="mt-7 text-sm font-bold uppercase tracking-[.16em] text-[#FFF200]">Authorized workspace</p><h1 className="mt-3 font-display text-4xl font-black">Welcome to your {role.toLowerCase()} dashboard.</h1><p className="mt-4 text-sm font-bold text-[#FFFFFF]/70">{claims?.schoolId}</p></div></section></main>
}
