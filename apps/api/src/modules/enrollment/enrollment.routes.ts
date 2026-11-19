import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { enrollmentService, facultyEnrollmentService } from './enrollment.service.ts'
import { HttpError } from '../../core/http-error.ts'

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1,fields:3,fieldSize:4096}})
export function createEnrollmentRouter(service=enrollmentService, role: 'Student' | 'Faculty' = 'Student') {
  const router=Router()
  router.use(requireLibraryPermission('accounts.manage'))
  router.use(rateLimit({windowMs:60_000,limit:80,standardHeaders:true,legacyHeaders:false}))
  const run=(work:(req:Request,actor:number)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{
    res.set('Cache-Control','private, no-store')
    void work(req,Number(res.locals.authenticatedUser.accountId)).then(data=>res.json({success:true,data})).catch(next)
  }
  router.get('/',run((_req,actor)=>service.overview(actor)))
  router.get('/qr-semesters',run((_req,actor)=>service.qrSemesters(actor)))
  router.get('/semesters/:id/qr-roster',run((req,actor)=>service.qrRoster(actor,req.params.id,req.query.page,req.query.q,req.query.account_status)))
  router.post('/semesters',run((req,actor)=>service.saveSemester(actor,req.body)))
  router.post('/semesters/:id/start',run((req,actor)=>service.start(actor,req.params.id)))
  router.post('/semesters/:id/end',run((req,actor)=>service.end(actor,req.params.id)))
  router.get('/semesters/:id/roster',run((req,actor)=>service.roster(actor,req.params.id,req.query.page,req.query.q)))
  router.post('/semesters/:id/roster/preview',upload.single('roster'),run((req,actor)=>{
    if(!req.file)throw new HttpError(422,'ENROLLMENT_FILE_REQUIRED','Choose a CSV or Excel roster.')
    return service.preview(actor,req.params.id,req.file,req.body)
  }))
  router.post('/semesters/:id/roster',upload.single('roster'),run((req,actor)=>{
    if(!req.file)throw new HttpError(422,'ENROLLMENT_FILE_REQUIRED','Choose a CSV or Excel roster.')
    return service.upload(actor,req.params.id,req.file,req.body)
  }))
  if (role === 'Student') {
    router.post('/semesters/:id/late-enrollment/review',upload.single('roster'),
      run((req,actor)=>service.reviewLateEnrollment(actor,req.params.id,req.file,req.body)))
    router.post('/semesters/:id/late-enrollment',upload.single('roster'),
      run((req,actor)=>service.saveLateEnrollment(actor,req.params.id,req.file,req.body)))
  }
  return router
}
export const enrollmentRouter=createEnrollmentRouter()
export const facultyEnrollmentRouter=createEnrollmentRouter(facultyEnrollmentService,'Faculty')
