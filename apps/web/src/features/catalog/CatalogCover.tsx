import { useState } from 'react'
import { BookInitialsCover } from './BookInitialsCover'
import { ResearchCover } from './ResearchCover'

type CatalogCoverProps = {
  title: string
  src?: string | null
  author?: string | null
  research?: { department?: string | null; publicationYear?: number | null }
  className?: string
  flush?: boolean
}

export function CatalogCover({ title, src, author, research, className = '', flush = false }: CatalogCoverProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const available = Boolean(src && src !== failedSource)

  return (
    <div className={`flex items-center justify-center overflow-hidden ${flush ? 'bg-white dark:bg-[#001a4d]' : 'rounded-xl bg-[#edf2ff] dark:bg-[#00225e]'} ${className}`}>
      {available ? (
        <img src={src!} alt={`${title} ${research ? 'research' : 'book'} cover`} loading="lazy"
          className={`h-full w-full object-contain ${flush ? '' : 'p-3'}`} onError={() => setFailedSource(src!)} />
      ) : research ? (
        <ResearchCover title={title} author={author} department={research.department} publicationYear={research.publicationYear} />
      ) : (
        <BookInitialsCover title={title} author={author} />
      )}
    </div>
  )
}
