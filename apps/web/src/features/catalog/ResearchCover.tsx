type ResearchCoverProps = {
  title: string
  author?: string | null
  department?: string | null
  publicationYear?: number | null
}

export function ResearchCover({ title, author, department, publicationYear }: ResearchCoverProps) {
  const program = department?.toLowerCase() ?? ''
  const tone = /tourism|bstm/.test(program) ? 'bg-[#815f00] text-white'
    : /hospitality|culinary|bshm/.test(program) ? 'bg-[#165c2f] text-white'
    : 'bg-[#08457a] text-white'
  return <div role="img" aria-label={`${title} research cover`} className={`h-full w-full p-[6%] ${tone}`} style={{ containerType: 'inline-size' }}>
    <div className="flex h-full flex-col justify-between gap-2 overflow-hidden border border-white/35 p-[6%] text-center font-serif">
      <p className="line-clamp-2 text-[clamp(.55rem,6cqw,1rem)] font-semibold">{department || 'Campus research'}</p>
      <p className="line-clamp-4 text-[clamp(.7rem,9cqw,1.25rem)] font-bold leading-tight">{title}</p>
      <div className="text-[clamp(.55rem,6cqw,.9rem)]">
        {author && <p className="line-clamp-2">{author}</p>}
        {publicationYear && <p>{publicationYear}</p>}
      </div>
    </div>
  </div>
}
