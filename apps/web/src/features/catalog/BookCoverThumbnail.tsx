import { BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

type BookCoverThumbnailProps = {
  title: string
  coverImagePath?: string | null
  className?: string
}

export function BookCoverThumbnail({ title, coverImagePath, className = 'h-20 w-14' }: BookCoverThumbnailProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [coverImagePath])

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#003399] text-[#FFF200] ${className}`}>
      {coverImagePath && !failed
        ? <img src={coverImagePath} alt={`${title} cover`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <BookOpen aria-hidden="true" size={22} />}
    </div>
  )
}
