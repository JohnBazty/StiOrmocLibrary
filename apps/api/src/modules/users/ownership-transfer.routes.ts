import {Router,type Request,type Response,type NextFunction} from 'express'
import {rateLimit} from 'express-rate-limit'
import {requireLibraryPermission} from '../auth/jwt-auth.middleware.ts'
import {ownershipTransfer} from './ownership-transfer.service.ts'
export function createOwnershipRouter(service=ownershipTransfer){
 const router=Router()
 router.use(requireLibraryPermission('library.manage'))
 const writeLimit=rateLimit({windowMs:15*60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false})
 const readLimit=rateLimit({windowMs:60_000,limit:40,standardHeaders:'draft-8',legacyHeaders:false})
 const run=(method:'state'|'preview'|'invite'|'cancel')=>(r:Request,s:Response,n:NextFunction)=>{
  s.set('Cache-Control','private, no-store')
  void service[method](Number(s.locals.authenticatedUser.accountId),r.body).then(data=>s.json({success:true,data})).catch(n)
 }
 router.get('/',readLimit,run('state'))
 router.post('/preview',writeLimit,run('preview'))
 router.post('/invite',writeLimit,run('invite'))
 router.post('/cancel',writeLimit,run('cancel'))
 return router
}
export const ownershipRouter=createOwnershipRouter()
