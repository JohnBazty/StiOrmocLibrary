import { Router, type NextFunction, type Request, type Response } from 'express'
import { createBorrowingScheduleService } from './borrowing-schedule.service.ts'

export function createBorrowingScheduleRouter(service=createBorrowingScheduleService()) {
  const router=Router()
  const handle=(run:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void run(req,res).catch(next)}
  const account=(res:Response)=>res.locals.authenticatedUser?.id
  router.get('/dates',handle(async(_req,res)=>{res.json({success:true,data:await service.dates()})}))
  router.get('/',handle(async(_req,res)=>{res.json({success:true,data:await service.list(account(res))})}))
  router.post('/',handle(async(req,res)=>{res.status(201).json({success:true,data:await service.create(account(res),req.body)})}))
  router.put('/:scheduleId/cancel',handle(async(req,res)=>{res.json({success:true,data:await service.cancel(account(res),req.params.scheduleId)})}))
  return router
}
