import { useState } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { catalogApi } from './catalog-api'
import { collectionReviewApi } from './collection-review-api'
import { Link } from 'react-router-dom'
import type { CatalogFilters } from './types'
import { OperationalReports } from './OperationalReports'
import { dashboardApi } from '../dashboard/dashboard-api'
const filters:CatalogFilters={q:'',scope:'all',categoryId:'',author:'',publicationYear:'',availability:''}
export function CatalogReportsPage(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function download(format:'csv'|'pdf',scope?:string){setBusy(true);setError('');try{if(scope==='dashboard')await dashboardApi.downloadAdminSummary();else if(scope)await collectionReviewApi.download(scope,format);else await catalogApi.downloadInventory(format,filters)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
 return <div className="space-y-5 text-[#003399] dark:text-white"><PageHeader eyebrow="Library records" title="Reports"/>{error&&<p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}<OperationalReports/><SectionCard className="space-y-3 p-5"><h2 className="font-bold">Current operational dashboard summary</h2><p className="text-sm">Current library totals; historical date filters above do not apply.</p><Button disabled={busy} onClick={()=>void download('pdf','dashboard')}>Dashboard summary PDF</Button></SectionCard>
 <SectionCard className="space-y-4 p-5"><h2 className="text-lg font-bold">Book collection review reports</h2><p className="text-sm">Full collection includes all book records and copy counts, including archived holdings. Updated and Exclusions partition that same collection using the approved reference year: copyright age under five, known valid year, active title and a usable physical or digital holding.</p><p className="text-sm">These reports show the school’s age-review rule. They do not certify CHED compliance.</p><Link className="text-sm font-bold underline" to="/librarian/collection-review">Review collection and approved requirements</Link><div className="grid gap-3 lg:grid-cols-3">{[['full','Full collection'],['updated','Updated collection'],['exclusions','Exclusions / review list']].map(([scope,title])=><div key={scope} className="space-y-3 rounded-xl border border-[#003399]/15 p-4 dark:border-white/20"><h3 className="font-semibold">{title}</h3><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void download('csv',scope)}>CSV</Button><Button variant="secondary" disabled={busy} onClick={()=>void download('pdf',scope)}>PDF</Button></div></div>)}</div></SectionCard></div>
}
