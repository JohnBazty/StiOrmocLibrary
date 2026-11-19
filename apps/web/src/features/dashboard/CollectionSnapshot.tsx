import { Link } from 'react-router-dom'
import { SectionCard } from '../../components/ui'
import type { DeskOverview } from './desk-dashboard-api'
import { deskField } from './DashboardTaskTable'

export function CollectionSnapshot({data,days,onDays}:{data:DeskOverview|null;days:number;onDays:(days:number)=>void}) {
  const max=Math.max(1,...(data?.groups.map(group=>group.count)??[0]))
  return <section aria-labelledby="collection-snapshot-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="collection-snapshot-heading" className="text-balance text-base font-bold">Collection snapshot</h2>
        <p className="mt-1 text-pretty text-xs opacity-75">{data?`${data.days} days ending ${new Date(data.generatedAt).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})}`:'Completed checkout events'}</p>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold">Reporting period
        <select aria-label="Reporting period" value={days} onChange={event=>onDays(Number(event.target.value))} className={deskField.replace('w-full','w-auto')}>
          <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option>
        </select>
      </label>
    </div>
    <div className="grid items-start gap-3 md:grid-cols-2">
      <SectionCard className="min-w-0 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-balance text-base font-bold">Top 5 most borrowed resources</h3><span className="text-xs opacity-75">Checkouts</span></div>
        {!data?<p className="mt-3 text-sm opacity-75">Reporting data unavailable.</p>:data.topBooks.length?<ol className="mt-2 divide-y divide-current/10">
          {data.topBooks.map((book,index)=><li key={book.id} className="flex items-center gap-3 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#0b5ea2]/5 text-xs font-bold tabular-nums dark:bg-white/10">{index+1}</span>
            <div className="min-w-0 flex-1"><p className="line-clamp-2 break-words text-sm font-semibold" title={book.title}>{book.title}</p><p className="text-xs opacity-75">{book.kind}</p></div>
            <span className="shrink-0 text-sm font-bold tabular-nums" aria-label={`${book.count} checkouts`}>{book.count}</span>
          </li>)}
        </ol>:<p className="mt-3 rounded-lg bg-slate-50 p-3 text-pretty text-sm opacity-75 dark:bg-white/5">No completed checkouts in this period.</p>}
        <Link className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline" to="/librarian/reports">Open detailed reports</Link>
      </SectionCard>
      <SectionCard className="min-w-0 p-4">
        <h3 className="text-balance text-base font-bold">Books borrowed by group</h3>
        {data?<ul aria-label="Checkout counts by academic group" className="mt-3 space-y-2">
          {data.groups.map(group=><li key={group.label} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 break-words sm:w-32">{group.label}</span>
            <div aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#0b5ea2]/5 dark:bg-white/10"><div className="h-full rounded-full bg-[#0b5ea2] dark:bg-blue-400" style={{width:group.count/max*100+'%'}}/></div>
            <strong className="min-w-5 shrink-0 text-right tabular-nums">{group.count}</strong>
          </li>)}
        </ul>:<p className="mt-3 text-sm opacity-75">Reporting data unavailable.</p>}
      </SectionCard>
    </div>
    <p className="mt-2 text-pretty text-xs leading-5 opacity-75">Completed take-home checkouts only; library-only thesis use is separate. Groups use current profiles, with faculty and unclassified records included.</p>
  </section>
}
