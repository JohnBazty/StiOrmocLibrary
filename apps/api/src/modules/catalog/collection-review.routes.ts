import {Router,type Request,type Response,type NextFunction} from 'express'
import {collectionReviewService} from './collection-review.service.ts'
import {collectionReport} from '../reports/collection-review-export.ts'
export const collectionReviewRouter=Router()
const actor=(r:Response)=>Number(r.locals.authenticatedUser.accountId)
const run=(fn:(r:Request,s:Response)=>Promise<unknown>)=>(r:Request,s:Response,n:NextFunction)=>{s.set('Cache-Control','private, no-store');void fn(r,s).then(data=>s.json({success:true,data})).catch(n)}
collectionReviewRouter.get('/',run((r,s)=>collectionReviewService.read(actor(s))))
collectionReviewRouter.post('/reference',run((r,s)=>collectionReviewService.approveYear(actor(s),r.body)))
collectionReviewRouter.post('/titles/:id/decisions',run((r,s)=>collectionReviewService.decide(actor(s),r.params.id,r.body)))
collectionReviewRouter.post('/requirements',run((r,s)=>collectionReviewService.saveRequirement(actor(s),r.body)))
collectionReviewRouter.get('/report',async(r,s,n)=>{try{const report=await collectionReport(actor(s),String(r.query.scope??'full'),String(r.query.format??'csv'));s.set({'Cache-Control':'private, no-store','Content-Type':report.type,'Content-Disposition':`attachment; filename="${report.filename}"`});report.stream.on('error',n).pipe(s)}catch(e){n(e)}})
