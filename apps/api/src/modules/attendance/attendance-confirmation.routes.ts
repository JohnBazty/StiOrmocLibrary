import { Router, type Request, type Response, type NextFunction } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { requireCsrfForStateChanges } from '../auth/auth.middleware.js'
import { attendanceConfirmations } from './attendance-confirmation.service.ts'

export function createAttendanceConfirmationRouters(service=attendanceConfirmations){
  const scanner=Router(),user=Router()
  const actor=(res:Response)=>Number(res.locals.authenticatedUser?.accountId)
  const handle=(run:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{
    res.set('Cache-Control','private, no-store')
    void run(req,res).then(data=>res.json({success:true,data})).catch(next)
  }
  scanner.use(requireJwtRoles('Librarian','Staff'),requireCsrfForStateChanges)
  user.use(requireJwtRoles('Student','Faculty','Staff','Librarian'),requireCsrfForStateChanges)
  const limit=rateLimit({windowMs:60_000,limit:30,keyGenerator:(_req,res)=>String(actor(res)),standardHeaders:'draft-8',legacyHeaders:false,
    message:{success:false,code:'ATTENDANCE_SCAN_RATE_LIMIT',message:'Too many scans. Wait a moment before scanning again.'}})
  scanner.post('/',limit,handle((req,res)=>service.create(actor(res),req.body)))
  scanner.get('/:id',handle((req,res)=>service.read(actor(res),req.params.id)))
  scanner.post('/:id/cancel',limit,handle((req,res)=>service.cancel(actor(res),req.params.id,true)))
  user.get('/pending',handle((_req,res)=>service.pending(actor(res))))
  user.post('/:id/confirm',limit,handle((req,res)=>service.confirm(actor(res),req.params.id,req.body)))
  user.post('/:id/cancel',limit,handle((req,res)=>service.cancel(actor(res),req.params.id)))
  return {scanner,user}
}
