import { cn } from '../../components/ui'
import {
  formatThesisCoverDate,
  resolveDegreeLine,
  splitThesisAuthors,
  thesisCoverTheme,
} from './thesis-cover'

type ThesisCoverCardProps = {
  title: string
  authors: string
  department: string
  publicationYear?: number | null
  className?: string
}

export function ThesisCoverCard({
  title,
  authors,
  department,
  publicationYear = null,
  className,
}: ThesisCoverCardProps) {
  const theme = thesisCoverTheme(department)
  const authorLines = splitThesisAuthors(authors)
  const degree = resolveDegreeLine(department)
  const departmentLine = department.trim() || 'Campus Program'

  return (
    <div
      className={cn(
        'relative flex aspect-[3/4] w-full flex-col justify-between overflow-hidden rounded-md px-[8%] py-[6%] text-center shadow-md ring-1 ring-black/15',
        className,
      )}
      style={{ backgroundColor: theme.background, color: theme.text, containerType: 'inline-size' }}
      role="img"
      aria-label={`${title} thesis cover`}
    >
      <div className="space-y-[0.4em]">
        <p className="line-clamp-3 font-serif text-[clamp(0.45rem,4.6cqw,0.68rem)] font-bold uppercase leading-tight tracking-wide">
          {title}
        </p>
        <div className="mx-auto space-y-0 font-serif text-[clamp(0.4rem,3.5cqw,0.52rem)] leading-tight" style={{ color: theme.muted }}>
          <p>A Capstone Project</p>
          <p>Presented to the Faculty of the</p>
          <p className="line-clamp-2">{departmentLine}</p>
          <p>STI College Ormoc</p>
        </div>
      </div>

      <div className="mx-auto font-serif text-[clamp(0.4rem,3.5cqw,0.52rem)] leading-tight" style={{ color: theme.muted }}>
        <p>In Partial Fulfillment</p>
        <p>of the Requirements for the Degree</p>
        <p className="mt-[0.35em] line-clamp-3 font-semibold" style={{ color: theme.text }}>{degree}</p>
      </div>

      <div className="space-y-[0.35em]">
        <div className="mx-auto max-h-[22cqw] space-y-0 overflow-hidden font-serif text-[clamp(0.4rem,3.5cqw,0.52rem)] font-semibold leading-tight">
          {authorLines.length ? authorLines.map((name) => <p key={name} className="truncate">{name}</p>) : <p>Author not recorded</p>}
        </div>
        <p className="font-serif text-[clamp(0.42rem,3.8cqw,0.58rem)] font-bold uppercase tracking-[0.08em] [font-variant-numeric:lining-nums]">
          {formatThesisCoverDate(publicationYear)}
        </p>
      </div>
    </div>
  )
}
