import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, GraduationCap, LibraryBig, Menu, Search, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { dashboardForRole, type AuthRole } from '../auth/auth-storage'

type Props = {
  role?: AuthRole
  query: string
  onSearch: (query: string) => void
}

export function PublicCatalogWelcome({ role, query, onSearch }: Props) {
  const location = useLocation()
  const [search, setSearch] = useState(query)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media?.matches) setMenuOpen(false) }
    media?.addEventListener('change', closeOnDesktop)
    return () => media?.removeEventListener('change', closeOnDesktop)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus() } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])
  useEffect(() => setSearch(query), [query])
  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(search.trim())
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })
  }
  return <>
    <header className="border-b border-catalog-brand/10 bg-white px-4 py-3 text-catalog-brand sm:px-5 sm:py-4 dark:bg-catalog-dark dark:text-white">
      <div className="mx-auto max-w-7xl">
       <div className="flex items-center justify-between gap-2 lg:gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3" aria-label="STI College Ormoc library home">
          <img src="/reference-logo.jpg" alt="" width={44} height={44} className="h-10 w-10 shrink-0 rounded-xl object-contain lg:h-11 lg:w-11" />
          <span className="min-w-0"><strong className="block text-xs font-black sm:text-sm">STI COLLEGE ORMOC</strong><span className="block text-[9px] font-bold uppercase tracking-[.16em] opacity-65 sm:text-[10px]">Online library</span></span>
        </Link>
        <nav aria-label="Public library navigation" className="hidden items-center gap-6 text-sm font-bold lg:flex">
          <a href="#home" className="inline-flex min-h-11 items-center border-b-2 border-catalog-brand pb-1 dark:border-[#FFF200]">Home</a><a href="#catalog" className="inline-flex min-h-11 items-center">Browse</a>
        </nav>
        <div className="flex shrink-0 items-center gap-2 text-sm font-bold lg:gap-3">
         <ThemeToggle className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-catalog-brand/15 bg-white text-catalog-brand/65 transition hover:bg-catalog-brand/5 dark:border-white/15 dark:bg-catalog-dark dark:text-white/80" />
         <div className="hidden items-center gap-3 lg:flex">{role ? <Link to={dashboardForRole(role)}>My workspace</Link> : <><Link className="inline-flex min-h-11 items-center" to="/login" state={{catalogLocation: location}}>Sign In</Link><Link to="/register" state={{catalogLocation: location}} className="rounded-full bg-[#FFF200] px-5 py-2.5 text-catalog-brand">Sign Up</Link></>}</div>
         <button ref={menuButton} type="button" aria-label={menuOpen?'Close public menu':'Open public menu'} aria-expanded={menuOpen} aria-controls="public-mobile-menu" onClick={()=>setMenuOpen(value=>!value)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-catalog-brand/15 hover:bg-catalog-brand/5 lg:hidden dark:border-white/15 dark:hover:bg-white/10">{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
        </div>
       </div>
       {menuOpen&&<div id="public-mobile-menu" className="mt-3 border-t border-catalog-brand/10 pt-3 lg:hidden dark:border-white/15">
        <nav aria-label="Mobile public library navigation" className="grid grid-cols-2 gap-2 text-sm font-bold">{[['#home','Home'],['#catalog','Browse']].map(([href,label])=><a key={href} href={href} onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl bg-catalog-brand/5 hover:bg-catalog-brand/10 dark:bg-white/5 dark:hover:bg-white/10">{label}</a>)}</nav>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">{role?<Link onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl bg-[#FFF200] px-4 text-catalog-brand col-span-2" to={dashboardForRole(role)}>My workspace</Link>:<><Link onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl border border-catalog-brand/20 px-4 dark:border-white/20" to="/login" state={{catalogLocation:location}}>Sign In</Link><Link onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl bg-[#FFF200] px-4 text-catalog-brand" to="/register" state={{catalogLocation:location}}>Sign Up</Link></>}</div>
       </div>}
      </div>
    </header>
    <section id="home" aria-labelledby="library-welcome" className="relative isolate overflow-hidden bg-catalog-brand bg-cover bg-center px-5 py-16 text-white sm:py-24" style={{backgroundImage:"linear-gradient(rgba(11,94,162,0.72), rgba(11,94,162,0.64)), url('/reference-library-hero.webp')"}}>

      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-white/75">Welcome to your online library</p>
        <h1 id="library-welcome" className="mt-5 font-display text-4xl font-black leading-[1.12] tracking-tight sm:text-6xl [text-shadow:0_2px_10px_rgba(0,17,51,0.45)]">Your <span className="text-[#FFF200]">Academic Hub</span><br/>at STI College Ormoc</h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">Discover books, research, and digital resources from your library. Search and explore freely. Sign in when you are ready to borrow a book.</p>
        <form onSubmit={submit} role="search" aria-label="Search public library" className="public-welcome-form mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-full border-4 border-white/20 bg-white p-2 text-catalog-brand shadow-xl">
          <Search className="ml-3 shrink-0 opacity-60" size={21}/><label className="sr-only" htmlFor="welcome-search">Search books, authors or ISBN</label><input id="welcome-search" value={search} onChange={event=>{setSearch(event.target.value);onSearch(event.target.value)}} placeholder="Search books, authors or ISBN..." className="public-welcome-search min-w-0 flex-1 bg-white py-2 text-sm outline-none placeholder:text-catalog-brand/55 sm:text-base"/><button aria-label="Search catalog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF200] text-catalog-brand focus-visible:outline-2 focus-visible:outline-offset-2"><ArrowRight/></button>
        </form>
        <div className="mx-auto mt-12 grid max-w-3xl gap-6 text-left sm:grid-cols-3">{[{icon:BookOpen,title:'Books & research',text:'Print and digital resources'},{icon:LibraryBig,title:'Browse freely',text:'No account needed to explore'},{icon:GraduationCap,title:'Campus borrowing',text:'Student and Faculty accounts'}].map(item=><div key={item.title} className="flex items-center gap-3"><item.icon className="shrink-0 text-[#FFF200]" size={28}/><div><strong className="block text-sm">{item.title}</strong><span className="text-xs text-white/70">{item.text}</span></div></div>)}</div>
      </div>
    </section>
  </>
}
