import { Router } from 'express'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { liveReportsService, parseReportFilters, exportLiveReport } from './live-reports.service.ts'
import { workspaceTasksService } from '../dashboard/workspace-tasks.service.ts'

export function createLiveReportsRouter(service = liveReportsService) {
  const router = Router()
  router.use(requireLibraryPermission('library.manage'))
  router.get('/',async(r,s,n)=>{try{const data=await service.read(s.locals.authenticatedUser.accountId,parseReportFilters(r.query));s.set('Cache-Control','private, no-store').json({success:true,data:{...data,rows:data.rows.slice((data.filters.page-1)*20,data.filters.page*20)}})}catch(e){n(e)}})
  router.get('/export',async(r,s,n)=>{try{const format=String(r.query.format??'csv'),data=await service.read(s.locals.authenticatedUser.accountId,parseReportFilters(r.query));const stream=exportLiveReport(data,format);s.set({'Content-Type':format==='pdf'?'application/pdf':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="sti-${data.kind}.${format}"`,'Cache-Control':'private, no-store'});stream.on('error',e=>s.destroy(e)).pipe(s)}catch(e){n(e)}})
  return router
}
export const liveReportsRouter = createLiveReportsRouter()
export function createWorkspaceTasksRouter(service = workspaceTasksService) {
  const router=Router()
  router.use(requireLibraryPermission('desk.operate'))
  router.get('/',async(_r,s,n)=>{try{s.set('Cache-Control','private, no-store').json({success:true,data:await service.read(s.locals.authenticatedUser.accountId)})}catch(e){n(e)}})
  return router
}
export const workspaceTasksRouter = createWorkspaceTasksRouter()
