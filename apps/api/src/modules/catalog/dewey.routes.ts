import {classifySubject,subjectRules,LOCAL_DDC_VERSION} from './ddc-subject-rules.ts'
import {ddcReference,ddcSections} from './ddc-sections.ts'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireCatalogManager } from './catalog.rbac.ts'
import { deweyLookup } from './dewey-lookup.service.ts'
import { automaticDewey } from './dewey-auto-assign.service.ts'
import { deweyService } from './dewey.service.ts'

export function createDeweyRouter(service = deweyService, lookup = deweyLookup) {
  const router = Router()
  router.use(requireCatalogManager)
  const run = (work:(req:Request,res:Response)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => {
    res.set('Cache-Control','no-store')
    void work(req,res).then(data=>res.json({success:true,data})).catch(next)
  }
  const actor = (res:Response) => Number(res.locals.authenticatedUser?.accountId)
  router.get('/lookup/:isbn',rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false}),run(req=>lookup.lookup(req.params.isbn)))
  router.get('/automatic/books',run(req=>automaticDewey.books(req.query)))
  router.post('/automatic/start',run((req,res)=>automaticDewey.start(req.body,actor(res))))
  router.post('/automatic/step',rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false,message:{success:false,code:'DEWEY_RATE_LIMITED',message:'Wait a minute before continuing automatic Dewey assignment. Completed assignments are kept.'}}),run((req,res)=>automaticDewey.step(req.body?.token,actor(res))))
  router.get('/local/reference',run(async()=>({reference:ddcReference,sections:ddcSections})))
  router.get('/local/rules',run(async()=>({version:LOCAL_DDC_VERSION,rules:subjectRules,reference:ddcReference,referencePositions:ddcSections.length,activeSections:ddcSections.filter(section=>section.status==='active').length,supportedSubjects:subjectRules.length})))
  router.post('/local/preview',run(async req=>classifySubject(String(req.body?.title??'').slice(0,255),String(req.body?.description??'').slice(0,5000))))
  router.get('/classifications',run(req=>service.classifications(req.query.q)))
  router.post('/classifications',run((req,res)=>service.saveClassification(null,req.body,actor(res))))
  router.patch('/classifications/:id',run((req,res)=>service.saveClassification(req.params.id,req.body,actor(res))))
  router.get('/copies',run(req=>service.copies(req.query)))
  router.post('/assign',run((req,res)=>service.assign(req.body,actor(res))))
  return router
}
export const deweyRouter = createDeweyRouter()
