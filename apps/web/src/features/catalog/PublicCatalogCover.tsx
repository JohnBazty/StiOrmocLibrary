import { useState } from 'react'

/** The reference cover presentation is used by the public catalog and signed-in dashboard. */
export function PublicCatalogCover({ title, author, src, className = '' }: {
  title: string; author?: string | null; src?: string | null; className?: string
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  return <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-catalog-dark ${className}`}>
    {src && src !== failedSource
      ? <img src={src} alt={`${title} book cover`} loading="lazy" className="h-full w-full object-contain" onError={() => setFailedSource(src)} />
      : <div role="img" aria-label={`${title} cover`} className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-catalog-brand py-[7%] pl-[11%] pr-[7%] text-left" style={{ containerType: 'inline-size' }}>
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[4.5%] bg-[#FFF200]" />
          <p className="line-clamp-6 font-display text-[clamp(0.55rem,8.2cqw,1.125rem)] font-black leading-tight text-[#FFF200]">{title.trim() || 'Untitled'}</p>
          <p className="line-clamp-3 text-[clamp(0.45rem,5.5cqw,0.75rem)] font-semibold leading-snug text-white">{author?.trim() || 'Author not recorded'}</p>
        </div>}
  </div>
}
