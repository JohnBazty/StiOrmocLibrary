import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, GraduationCap, LibraryBig, Menu, Search, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { dashboardForRole, type AuthRole } from '../auth/auth-storage'
import type { Option } from './enhanced-catalog-api'

type Props = {
  role?: AuthRole
  query: string
  categories: Option[]
  selectedCategory: string
  total?: number
  loading?: boolean
  onSearch: (query: string) => void
  onCategory: (id: string) => void
}

export function PublicCatalogWelcome({
  role,
  query,
  categories,
  selectedCategory,
  total,
  loading = false,
  onSearch,
  onCategory,
}: Props) {
  const location = useLocation()
  const [search, setSearch] = useState(query)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  const activeNav =
    location.hash === '#catalog'
      ? '#catalog'
      : location.hash === '#categories'
        ? '#categories'
        : '#home'

  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media?.matches) setMenuOpen(false) }
    media?.addEventListener('change', closeOnDesktop)
    return () => media?.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  useEffect(() => setSearch(query), [query])

  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(search.trim())
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/95 px-4 py-3 text-[var(--sl-text-header)] backdrop-blur-md transition-colors sm:px-5 sm:py-3.5">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-2 lg:gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="STI College Ormoc library home">
              <img src="/logo.jpg" alt="" className="h-10 w-10 shrink-0 rounded-[6px] object-contain lg:h-11 lg:w-11" />
              <span className="min-w-0">
                <strong className="block font-display text-xs font-black tracking-tight text-[var(--sl-text-header)] sm:text-sm">
                  STI COLLEGE ORMOC
                </strong>
                <span className="block text-[9px] font-bold uppercase tracking-[.16em] text-[var(--sl-text-muted)] sm:text-[10px]">
                  Online library
                </span>
              </span>
            </Link>

            <nav aria-label="Public library navigation" className="hidden items-center gap-6 text-sm font-semibold lg:flex">
              {([['#home', 'Home'], ['#catalog', 'Browse'], ['#categories', 'Categories']] as const).map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  aria-current={activeNav === href ? 'location' : undefined}
                  className={
                    activeNav === href
                      ? 'inline-flex min-h-10 items-center border-b-2 border-[#0b5ea2] pb-0.5 text-[#0b5ea2] dark:border-[#FFF200] dark:text-[#FFF200]'
                      : 'inline-flex min-h-10 items-center text-[var(--sl-text-secondary)] transition-colors hover:text-[var(--sl-text-header)]'
                  }
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold lg:gap-2.5">
              <ThemeToggle className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]" />
              {role ? (
                <Link
                  to={dashboardForRole(role)}
                  className="hidden min-h-10 items-center rounded-[6px] bg-[#0b5ea2] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#094e87] lg:inline-flex"
                >
                  My workspace
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    state={{ catalogLocation: location }}
                    className="hidden min-h-10 items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] transition-colors hover:bg-[var(--sl-bg-subtle)] lg:inline-flex"
                  >
                    Activate account
                  </Link>
                  <Link
                    to="/login"
                    state={{ catalogLocation: location }}
                    className="inline-flex min-h-10 shrink-0 items-center rounded-[6px] bg-[#0b5ea2] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#094e87] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2]"
                  >
                    Sign In
                  </Link>
                </>
              )}
              <button
                ref={menuButton}
                type="button"
                aria-label={menuOpen ? 'Close public menu' : 'Open public menu'}
                aria-expanded={menuOpen}
                aria-controls="public-mobile-menu"
                onClick={() => setMenuOpen(value => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] lg:hidden"
              >
                {menuOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div id="public-mobile-menu" className="mt-3 border-t border-[var(--sl-border)] pt-3 lg:hidden">
              <nav aria-label="Mobile public library navigation" className="grid grid-cols-3 gap-2 text-sm font-semibold">
                {[['#home', 'Home'], ['#catalog', 'Browse'], ['#categories', 'Categories']].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center justify-center rounded-[6px] bg-[var(--sl-bg-subtle)] text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-hover)]"
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
                {role ? (
                  <Link
                    onClick={() => setMenuOpen(false)}
                    className="col-span-2 flex min-h-11 items-center justify-center rounded-[6px] bg-[#0b5ea2] px-4 text-white"
                    to={dashboardForRole(role)}
                  >
                    My workspace
                  </Link>
                ) : (
                  <>
                    <Link
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-11 items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] px-3 text-center text-[var(--sl-text-header)]"
                      to="/register"
                      state={{ catalogLocation: location }}
                    >
                      Activate account
                    </Link>
                    <Link
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-11 items-center justify-center rounded-[6px] bg-[#0b5ea2] px-3 text-white"
                      to="/login"
                      state={{ catalogLocation: location }}
                    >
                      Sign In
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <section
        id="home"
        aria-labelledby="library-welcome"
        className="relative isolate overflow-hidden bg-[#132a3f] bg-cover bg-center px-5 py-10 text-white sm:py-14"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(19,42,63,0.90) 0%, rgba(11,94,162,0.82) 100%), url('/library-hero.webp')",
        }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-white/85">
            Welcome to your online library
          </p>
          <h1 id="library-welcome" className="mt-3 font-display text-3xl font-black leading-[1.12] tracking-tight sm:text-5xl">
            Your <span className="text-[#FFF200]">Academic Hub</span>
            <br />
            at STI College Ormoc
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/90 sm:text-base">
            Discover books, research, and digital resources from your library. Search freely and sign in when you are ready to borrow.
          </p>

          <form
            onSubmit={submit}
            role="search"
            aria-label="Search public library"
            className="mx-auto mt-6 flex max-w-2xl items-center gap-2 rounded-[10px] border-2 border-white/25 bg-white p-1.5 text-[#132a3f] shadow-[var(--sl-shadow-l)]"
          >
            <Search className="ml-2.5 shrink-0 text-[#64748b]" size={19} aria-hidden="true" />
            <label className="sr-only" htmlFor="welcome-search">Search books, authors or ISBN</label>
            <input
              id="welcome-search"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                onSearch(event.target.value)
              }}
              placeholder="Search books, authors or ISBN..."
              className="min-w-0 flex-1 bg-white py-2 text-sm text-[#1e293b] outline-none placeholder:text-[#64748b] sm:text-base"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch('')
                  onSearch('')
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#132a3f]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
            <button
              aria-label="Search catalog"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[#FFF200] text-[#132a3f] transition-colors hover:bg-[#f5e800] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2]"
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>

          {query && !loading && typeof total === 'number' ? (
            <p className="mt-2.5 text-xs font-medium text-white/90">
              {total === 0
                ? `No resources match "${query}".`
                : `Showing ${total} matching ${total === 1 ? 'resource' : 'resources'} below — press Enter to jump to results.`}
            </p>
          ) : null}

          <div className="mx-auto mt-7 grid max-w-3xl gap-4 rounded-[10px] border border-white/15 bg-[#132a3f]/60 px-5 py-4 text-left backdrop-blur-sm sm:grid-cols-3">
            {[
              { icon: BookOpen, title: 'Books & research', text: 'Print and digital resources' },
              { icon: LibraryBig, title: 'Browse freely', text: 'No account needed to explore' },
              { icon: GraduationCap, title: 'Campus borrowing', text: 'Student and Faculty accounts' },
            ].map(item => (
              <div key={item.title} className="flex items-center gap-3">
                <item.icon className="shrink-0 text-[#FFF200]" size={24} aria-hidden="true" />
                <div>
                  <strong className="block text-sm font-semibold text-white">{item.title}</strong>
                  <span className="text-xs text-white/80">{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="categories"
        aria-label="Browse by category"
        className="scroll-mt-16 border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-5 py-4"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <h2 className="mr-2 text-xs font-bold uppercase tracking-wider text-[var(--sl-text-muted)]">
            Browse by category
          </h2>
          <a
            href="#catalog"
            onClick={() => onCategory('')}
            className={
              !selectedCategory
                ? 'rounded-[6px] bg-[#0b5ea2] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--sl-shadow-xs)]'
                : 'rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--sl-text)] transition-colors hover:bg-[var(--sl-bg-hover)]'
            }
          >
            All resources
          </a>
          {categories.map(category => (
            <a
              href="#catalog"
              key={category.id}
              onClick={() => onCategory(String(category.id))}
              className={
                selectedCategory === String(category.id)
                  ? 'rounded-[6px] bg-[#0b5ea2] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--sl-shadow-xs)]'
                  : 'rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--sl-text)] transition-colors hover:bg-[var(--sl-bg-hover)]'
              }
            >
              {category.name}
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
