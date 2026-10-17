import { Router,type Request,type Response,type NextFunction } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { enrollmentService } from './enrollment.service.ts'
import { HttpError } from '../../core/http-error.ts'
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1,fields:8,fieldSize:4096}})
export function createEnrollmentRouter(service=enrollmentService) {
 const router=Router()
 router.use(requireLibraryPermission('library.manage'))
 router.use(rateLimit({windowMs:60000,limit:80,standardHeaders:true,legacyHeaders:false}))
 const run=(fn:(req:Request,actor:number)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{res.set('Cache-Control','private, no-store');void fn(req,Number(res.locals.authenticatedUser.accountId??res.locals.authenticatedUser.id)).then(data=>res.json({success:true,data})).catch(next)}
 router.get('/',run((_req,actor)=>service.overview(actor)))
 router.post('/terms',run((req,actor)=>service.saveTerm(actor,req.body)))
 router.put('/settings',run((req,actor)=>service.configure(actor,req.body)))
 router.post('/imports',upload.single('roster'),run((req,actor)=>{if(!req.file)throw new HttpError(422,'ENROLLMENT_FILE_REQUIRED','Choose the registrar roster first.');return service.stage(actor,req.file,req.body)}))
 router.get('/imports/:id',run((req,actor)=>service.preview(actor,Number(req.params.id),Number(req.query.page??1))))
 router.post('/imports/:id/confirm',run((req,actor)=>service.confirm(actor,Number(req.params.id),req.body)))
 router.get('/review',run((req,actor)=>service.review(actor,String(req.query.q??''),Number(req.query.page??1))))
 router.post('/review',run((req,actor)=>service.applyReview(actor,req.body)))
 return router
}
export const enrollmentRouter=createEnrollmentRouter()
