import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={
        className ||
        'rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 transition hover:bg-[#003399]/5 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10'
      }
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
