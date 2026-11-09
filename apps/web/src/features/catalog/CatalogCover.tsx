import { useState } from 'react'
import { BookInitialsCover } from './BookInitialsCover'

export function CatalogCover({ title, src, className = '', flush = false }: { title: string; src?: string | null; className?: string; flush?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const available = Boolean(src && src !== failedSource)

  return (
    <div className={`flex items-center justify-center overflow-hidden ${flush ? 'bg-white dark:bg-[#001a4d]' : 'rounded-xl bg-[#edf2ff] dark:bg-[#00225e]'} ${className}`}>
      {available ? (
        <img src={src!} alt={`${title} book cover`} loading="lazy" className={`h-full w-full object-contain ${flush ? '' : 'p-3'}`} onError={() => setFailedSource(src!)} />
      ) : (
        <BookInitialsCover title={title} />
      )}
    </div>
  )
}
