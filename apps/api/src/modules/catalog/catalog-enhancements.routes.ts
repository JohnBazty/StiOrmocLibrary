import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { fillImportFromLookup } from './import-lookup-fill.ts'
import { exportFoundRows, fillFoundRows, readFoundRows } from './find-book-details.ts'
import * as service from './catalog-enhancements.service.ts'
import type { SheetMapping } from './holdings-parser.ts'
import { HttpError } from '../../core/http-error.ts'

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4194304,files:1,fields:4,fieldSize:32768}})
export const catalogUpload=upload
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
// Each click looks up at most 50 rows; the limit keeps repeated clicks from using up the Google Books daily quota.
const lookupFillLimit=rateLimit({windowMs:60000,limit:6,standardHeaders:true,legacyHeaders:false,keyGenerator:(req,res)=>`account:${res.locals.authenticatedUser?.accountId ?? ipKeyGenerator(req.ip ?? '')}`,message:{success:false,code:'LOOKUP_RATE_LIMITED',message:'Wait a minute before filling more rows.'}})
catalogMaintenanceRouter.post('/imports/:id/fill-from-lookup',lookupFillLimit,run(req=>fillImportFromLookup(Number(req.params.id)>0&&Number.isSafeInteger(Number(req.params.id))?Number(req.params.id):(()=>{throw new HttpError(422,'IMPORT_BATCH_INVALID','Choose an import batch.')})())))
// Find book details: read, fill and download a book list; nothing is saved (plan 2026-11-13-find-book-details).
// Reading and building files is heavy work: a small per-account limit.
const findFileLimit=rateLimit({windowMs:60000,limit:20,standardHeaders:true,legacyHeaders:false,keyGenerator:(req,res)=>`account:${res.locals.authenticatedUser?.accountId ?? ipKeyGenerator(req.ip ?? '')}`,message:{success:false,code:'FIND_RATE_LIMITED',message:'Wait a minute before reading or downloading again.'}})
catalogMaintenanceRouter.post('/find/read',findFileLimit,upload.single('holdings'),run(req=>readFoundRows(req.file,mappings(req.body.mapping))))
catalogMaintenanceRouter.post('/find/fill',lookupFillLimit,run(req=>fillFoundRows(req.body?.rows)))
catalogMaintenanceRouter.post('/find/export',findFileLimit,async(req,res,next)=>{try{const file=await exportFoundRows(req.body?.rows,req.query.format==='xlsx'?'xlsx':req.query.format==='csv'?'csv':String(req.query.format) as never);res.set({'Content-Type':file.contentType,'Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(file.body)}catch(e){next(e)}})
catalogMaintenanceRouter.post('/imports/:id/commit',run((req,res)=>service.commitImport(req.params.id,Number(res.locals.authenticatedUser.accountId))))
