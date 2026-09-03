import { Router } from 'express'
import type { NextFunction,Request,Response } from 'express'
import { parseActiveUserFilters,usersRepository } from './users.repository.ts'
const handle=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)}
export const usersRouter=Router()
usersRouter.get('/summary',handle(async(_req,res)=>{res.json({success:true,data:await usersRepository.summary()})}))
usersRouter.get('/programs',handle(async(_req,res)=>{res.json({success:true,data:await usersRepository.programs()})}))
usersRouter.get('/active',handle(async(req,res)=>{const result=await usersRepository.active(parseActiveUserFilters(req.query));res.json({success:true,data:result.rows,meta:{pagination:result.pagination}})}))
export const adminUsersV1Router=usersRouter
