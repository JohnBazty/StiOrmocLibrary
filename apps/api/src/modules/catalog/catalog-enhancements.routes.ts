import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import * as service from './catalog-enhancements.service.ts'
import type { SheetMapping } from './holdings-parser.ts'
import { HttpError } from '../../core/http-error.ts'

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4194304,files:1,fields:4,fieldSize:32768}})
const run=(fn:(request:Request,response:Response)=>Promise<unknown>)=>(request:Request,response:Response,next:NextFunction)=>{response.set('Cache-Control','no-store');void fn(request,response).then(data=>response.json({success:true,data})).catch(next)}
const mappings=(value:unknown):SheetMapping[]=>{try{return JSON.parse(String(value))}catch{throw new HttpError(422,'HOLDINGS_MAPPING_INVALID','Confirm the sheet mappings.')}}
export const publicCatalogRouter=Router()
publicCatalogRouter.use(rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}))
publicCatalogRouter.get('/options',run(()=>service.catalogOptions(true)))
publicCatalogRouter.get('/titles',run((req,res)=>service.publicCatalog(req.query)))
publicCatalogRouter.get('/titles/:id',run((req,res)=>service.publicDetail(req.params.id)))
publicCatalogRouter.get('/files/:id',async(req,res,next)=>{try{const file=await service.digitalDownload(req.params.id);res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(file.bytes)}catch(e){next(e)}})
export const catalogMaintenanceRouter=Router()
catalogMaintenanceRouter.get('/options',run(()=>service.catalogOptions()))
catalogMaintenanceRouter.post('/foundation/:kind',run((req,res)=>service.saveFoundation(String(req.params.kind),null,req.body,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.patch('/foundation/:kind/:id',run((req,res)=>service.saveFoundation(String(req.params.kind),req.params.id,req.body,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.put('/titles/:id/details',run((req,res)=>service.saveDetails(req.params.id,req.body,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.post('/titles/:id/files',upload.single('digital'),run((req,res)=>service.uploadDigital(req.params.id,req.file,req.body,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.post('/files/:id/archive',run((req,res)=>service.archiveDigital(req.params.id,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.post('/imports/inspect',upload.single('holdings'),run((req,res)=>service.inspectHoldings(req.file)))
catalogMaintenanceRouter.post('/imports',upload.single('holdings'),run((req,res)=>service.stageHoldings(req.file,mappings(req.body.mapping),Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.get('/imports',run(()=>service.importBatches()))
catalogMaintenanceRouter.get('/imports/:id',run((req,res)=>service.importBatch(req.params.id)))
catalogMaintenanceRouter.put('/imports/rows/:id',run((req,res)=>service.reviewImport(req.params.id,req.body,Number(res.locals.authenticatedUser.accountId))))
catalogMaintenanceRouter.post('/imports/:id/commit',run((req,res)=>service.commitImport(req.params.id,Number(res.locals.authenticatedUser.accountId))))
