import { useState } from 'react'
import { BookInitialsCover } from './BookInitialsCover'

type BookCoverThumbnailProps = {
  title: string
  coverImagePath?: string | null
  className?: string
}

export function BookCoverThumbnail({ title, coverImagePath, className = 'h-20 w-14' }: BookCoverThumbnailProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0b5ea2] text-[#FFF200] ${className}`}>
      {coverImagePath && coverImagePath !== failedSource
        ? <img src={coverImagePath} alt={`${title} cover`} className="h-full w-full object-cover" onError={() => setFailedSource(coverImagePath)} />
        : <BookInitialsCover title={title} />}
    </div>
  )
}
