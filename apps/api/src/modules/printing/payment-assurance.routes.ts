import { Router,type Request,type Response,type NextFunction } from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import { requireCsrfForStateChanges } from '../auth/auth.middleware.js'
import { requireJwtRoles,requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { HttpError } from '../../core/http-error.ts'
import type { createPrintingPaymentAssurance } from './payment-assurance.service.ts'
import { MAX_PAYMENT_PROOF_BYTES } from './payment-proof.storage.ts'
import { createProviderPaymentRecordPdf } from './payment-record.pdf.ts'

type Service=ReturnType<typeof createPrintingPaymentAssurance>
const actor=(response:Response)=>({accountId:response.locals.authenticatedUser?.accountId??response.locals.authenticatedUser?.id,role:response.locals.authenticatedUser?.role})
const handle=(run:(request:Request,response:Response)=>Promise<void>)=>(request:Request,response:Response,next:NextFunction)=>{void run(request,response).catch(next)}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_PAYMENT_PROOF_BYTES,files:1,fields:3,fieldSize:1024},fileFilter:(_request,file,done)=>{
 if(!['image/png','image/jpeg'].includes(file.mimetype))return done(new HttpError(422,'PAYMENT_PROOF_INVALID','Choose a PNG or JPEG receipt image.'))
 done(null,true)
}})
const receiptUpload=(request:Request,response:Response,next:NextFunction)=>upload.single('receipt')(request,response,error=>{
 if(error instanceof multer.MulterError)return next(new HttpError(422,error.code==='LIMIT_FILE_SIZE'?'PAYMENT_PROOF_TOO_LARGE':'PAYMENT_PROOF_INVALID',error.code==='LIMIT_FILE_SIZE'?'The receipt image must not exceed 3 MB.':'Choose one receipt image and review its details.'))
 return error?next(error):next()
})
export function createPrintingPaymentAssuranceRouters(service:Service){
 const user=Router(),admin=Router()
 const writes=rateLimit({windowMs:60_000,limit:8,standardHeaders:'draft-7',legacyHeaders:false,keyGenerator:(_request,response)=>String(response.locals.authenticatedUser?.accountId??'unknown'),message:{success:false,code:'PAYMENT_PROOF_RATE_LIMIT',message:'Please wait a minute before uploading or reviewing another receipt.'}})
 user.use(requireJwtRoles('Student','Faculty'),requireCsrfForStateChanges)
 admin.use(requireLibraryPermission('desk.operate'),requireCsrfForStateChanges)
 for(const[router,staff]of[[user,false],[admin,true]]as const){
  router.get('/:id/proofs',handle(async(request,response)=>{response.set('Cache-Control','private, no-store').json({success:true,data:await service.list(actor(response),request.params.id,staff)})}))
  router.get('/proofs/:proofId/image',handle(async(request,response)=>{const image=await service.image(actor(response),request.params.proofId,staff);response.set({'Content-Type':'image/png','Content-Disposition':'inline; filename="payment-receipt.png"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(image)}))
  router.get('/:id/record/pdf',handle(async(request,response)=>{
   const record=await service.paymentRecord(actor(response),request.params.id,staff)
   response.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="payment-${record.paymentId}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
   createProviderPaymentRecordPdf(record).pipe(response)
  }))
 }
 user.post('/:id/proofs',writes,receiptUpload,handle(async(request,response)=>{response.status(201).set('Cache-Control','private, no-store').json({success:true,data:await service.upload(actor(response),request.params.id,request.body,request.file)})}))
 admin.patch('/proofs/:proofId/review',writes,handle(async(request,response)=>{response.set('Cache-Control','private, no-store').json({success:true,data:await service.review(actor(response),request.params.proofId,request.body)})}))
 return{user,admin}
}
