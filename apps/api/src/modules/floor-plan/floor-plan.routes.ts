import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { floorPlanRepository as repository } from './floor-plan.repository.ts'
import { gridCount, gridPosition, positiveId, shelfLabel, validateLayout, versionNumber } from './floor-plan.validation.ts'
import { storeCoverImage } from '../catalog/cover-image.storage.ts'
import { HttpError } from '../../core/http-error.ts'
const handler=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).then(data=>res.json({success:true,data})).catch(next)}
const actor=(res:Response)=>positiveId(res.locals.authenticatedUser?.accountId??res.locals.authenticatedUser?.id)
export const floorPlanRouter=Router()
floorPlanRouter.get('/',handler(()=>repository.state()))
floorPlanRouter.get('/books',handler(req=>repository.books(req.query)))
floorPlanRouter.get('/locations',handler(()=>repository.locations()))
floorPlanRouter.get('/editor',requireJwtRoles('Admin'),handler(()=>repository.state(true)))
floorPlanRouter.get('/versions',requireJwtRoles('Admin'),handler(()=>repository.versions()))
floorPlanRouter.put('/draft',requireJwtRoles('Admin'),handler((req,res)=>repository.save(actor(res),versionNumber(req.body?.revision),validateLayout(req.body?.layout))))
floorPlanRouter.post('/publish',requireJwtRoles('Admin'),handler((req,res)=>repository.save(actor(res),versionNumber(req.body?.revision),validateLayout(req.body?.layout),true)))
floorPlanRouter.post('/versions/:id/restore',requireJwtRoles('Admin'),handler((req,res)=>repository.restore(actor(res),positiveId(req.params.id),versionNumber(req.body?.revision))))
floorPlanRouter.post('/shelves',requireJwtRoles('Admin'),handler((req,res)=>repository.addShelf(actor(res),shelfLabel(req.body?.label))))
floorPlanRouter.patch('/shelves/:id/grid',requireJwtRoles('Admin'),handler((req,res)=>repository.updateGrid(actor(res),positiveId(req.params.id),gridCount(req.body?.columnCount,'Columns'),gridCount(req.body?.rowCount,'Rows'))))
floorPlanRouter.post('/transfer',requireJwtRoles('Admin'),handler((req,res)=>{
  if(!Array.isArray(req.body?.copyIds)||!req.body.copyIds.length||req.body.copyIds.length>100)throw new HttpError(422,'COPIES_INVALID','Select 1–100 copies to transfer.')
  return repository.transfer(actor(res),[...new Set<number>(req.body.copyIds.map(positiveId))],positiveId(req.body?.shelfId),gridPosition(req.body?.shelfColumn,'Column'),gridPosition(req.body?.shelfRow,'Row'))
}))
floorPlanRouter.post('/background',requireJwtRoles('Admin'),handler(async req=>{
  if(typeof req.body?.image!=='string')throw new HttpError(422,'IMAGE_INVALID','Choose an image.')
  return {path:await storeCoverImage(req.body.image)}
}))
