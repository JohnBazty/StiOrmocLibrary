import { Router,type Request,type Response,type NextFunction } from 'express'
import { deskCirculationService,type DeskActor } from './desk-circulation.service.ts'
const actor=(res:Response):DeskActor=>({accountId:Number(res.locals.authenticatedUser?.accountId),role:String(res.locals.authenticatedUser?.role)})
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{res.set('Cache-Control','no-store');void fn(req,res).then(data=>res.json({success:true,data})).catch(next)}
export const deskCirculationRouter=Router()
deskCirculationRouter.post('/borrower',handle((req,res)=>deskCirculationService.borrower(actor(res),req.body)))
deskCirculationRouter.post('/preview',handle((req,res)=>deskCirculationService.preview(actor(res),req.body)))
deskCirculationRouter.post('/checkout',handle((req,res)=>deskCirculationService.checkout(actor(res),req.body)))
deskCirculationRouter.post('/return-preview',handle((req,res)=>deskCirculationService.returnPreview(actor(res),req.body)))
deskCirculationRouter.post('/return',handle((req,res)=>deskCirculationService.returnCopy(actor(res),req.body)))
deskCirculationRouter.get('/in-library',handle((_req,res)=>deskCirculationService.uses(actor(res))))
export const userInLibraryRouter=Router()
userInLibraryRouter.get('/in-library',handle((_req,res)=>deskCirculationService.mine(Number(res.locals.authenticatedUser?.accountId))))
