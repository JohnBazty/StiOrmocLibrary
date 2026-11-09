function titleInitials(title: string) {
  const words = title.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu) ?? []
  if (!words.length) return 'BK'
  if (words.length === 1) return /^\d{1,4}$/.test(words[0]) ? words[0] : Array.from(words[0]).slice(0, 2).join('').toLocaleUpperCase()
  return words.slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase()
}

/** Shared local fallback: never downloads or creates a replacement cover image. */
export function BookInitialsCover({ title, author }: { title: string; author?: string | null }) {
  return <div role="img" aria-label={`${title || 'Book'} — title initials cover`} className="relative flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0b5ea2] p-2 text-[#FFF200]" style={{ containerType: 'inline-size' }}>
    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[#FFF200]" />
    <span aria-hidden="true" className="max-w-full px-1 text-center font-bold leading-none" style={{ fontSize: 'clamp(0.75rem, 26cqw, 4rem)' }}>{titleInitials(title)}</span>
    {author && <p className="line-clamp-2 px-1 text-center text-[clamp(.55rem,6cqw,.85rem)] font-semibold text-white">{author}</p>}
  </div>
}
