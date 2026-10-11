import { useState } from 'react'
import { BookOpen } from 'lucide-react'

export function CatalogCover({ title, src, className = '', flush = false }: { title: string; src?: string | null; className?: string; flush?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const available = Boolean(src && src !== failedSource)

  return (
    <div className={`flex items-center justify-center overflow-hidden ${flush ? 'bg-white dark:bg-[#001a4d]' : 'rounded-xl bg-[#edf2ff] dark:bg-[#00225e]'} ${className}`}>
      {available ? (
        <img src={src!} alt={`${title} book cover`} loading="lazy" className={`h-full w-full object-contain ${flush ? '' : 'p-3'}`} onError={() => setFailedSource(src!)} />
      ) : (
        <div className="flex flex-col items-center gap-3 p-5 text-center text-[#003399] dark:text-white">
          <BookOpen size={40} aria-hidden="true" />
          <span className="text-sm">Cover not available</span>
        </div>
      )}
    </div>
  )
}
