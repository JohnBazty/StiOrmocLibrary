import type { NextFunction,Request,Response } from 'express'
import QRCode from 'qrcode'
import { createBrandedTablePdf } from '../reports/branded-table-pdf.ts'
import { attendanceRepository } from './attendance.repository.ts'
import { attendanceService } from './attendance.service.ts'
import { parseAttendanceFilters } from './attendance.validation.ts'
import { HttpError } from '../../core/http-error.ts'
import { attendanceOperations } from './attendance-operations.service.ts'
import { dbDriver } from '../../config/db.js'
const handle=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)}
const actor=(res:Response)=>{const user=res.locals.authenticatedUser as {accountId?:number;id?:number;role?:string}|undefined;return{accountId:user?.accountId??user?.id,role:user?.role}}
export const attendanceController={
 terms:handle(async(_req,res)=>{res.json({success:true,data:await attendanceRepository.terms()})}),
 summary:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f);res.json({success:true,data:await attendanceRepository.summary(f,r)})}),
 analytics:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f);res.json({success:true,data:await attendanceRepository.analytics(f,r)})}),
 logs:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f),result=await attendanceRepository.logs(f,r);res.json({success:true,data:result.rows,meta:{pagination:result.pagination,range:r}})}),
 pdf:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f),summary=await attendanceRepository.summary(f,r);const report=createBrandedTablePdf(attendanceRepository.reportRows(f,r),{title:'ATTENDANCE REPORT',subtitle:`${r.label} | Visits: ${summary.total_visits??0} | Unique visitors: ${summary.unique_visitors??0} | Peak occupied seats: ${summary.peak_occupancy??0}`,emptyMessage:'No attendance records match the selected filters.',columns:[{key:'visitor_name',label:'VISITOR',width:180},{key:'school_id',label:'SCHOOL ID',width:110},{key:'role',label:'ROLE',width:80},{key:'attendance_date',label:'DATE',width:90},{key:'time_in',label:'TIME IN',width:80},{key:'time_out',label:'TIME OUT',width:80},{key:'purpose',label:'PURPOSE',width:125},{key:'presence',label:'PRESENCE',width:75},{key:'checkout_source',label:'EXIT SOURCE',width:115}]});res.status(200).set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="smartlib-attendance-${f.period}-${r.from}.pdf"`,'Cache-Control':'no-store'});report.pipe(res)}),
 myPass:handle(async(_req,res)=>{const pass=await attendanceService.myPass(actor(res));const{payload:_,...credential}=pass.credential;res.set('Cache-Control','private, no-store').json({success:true,data:{...pass,credential}})}),
 passPng:handle(async(req,res)=>{const pass=await attendanceService.myPass(actor(res));const png=await QRCode.toBuffer(pass.credential.payload,{type:'png',width:768,margin:4,errorCorrectionLevel:'M',color:{dark:'#003399',light:'#FFFFFF'}});const fileName=`STI-Library-Pass-${pass.profile.schoolId.replace(/[^A-Za-z0-9_-]/g,'-')}.png`;res.status(200).set({'Content-Type':'image/png','Content-Length':String(png.length),'Cache-Control':'private, no-store',...(String(req.query.download)==='1'?{'Content-Disposition':`attachment; filename="${fileName}"`}:{})}).send(png)}),
 resolve:handle(async(req,res)=>{res.json({success:true,data:dbDriver==='postgres'?await attendanceOperations.resolve(actor(res).accountId!,req.body):await attendanceService.resolve(req.body)})}),
 scan:handle(async(req,res)=>{const data=await attendanceOperations.scan(actor(res).accountId!,req.body);res.status(data.duplicate?200:201).json({success:true,message:data.message,data})}),
 checkIn:handle(async(req,res)=>{const data=dbDriver==='postgres'?await attendanceOperations.scan(actor(res).accountId!,{...req.body,expected_action:'Entry'}):await attendanceService.checkIn(actor(res),req.body);res.status(data.duplicate?200:201).json({success:true,message:data.message,data})}),
 checkOut:handle(async(req,res)=>{const data=dbDriver==='postgres'?await attendanceOperations.scan(actor(res).accountId!,{...req.body,expected_action:'Exit'}):await attendanceService.checkOut(actor(res),req.body);res.json({success:true,message:data.message,data})}),
 capacity:handle(async(_req,res)=>{res.json({success:true,data:dbDriver==='postgres'?await attendanceOperations.state():await attendanceService.capacity()})}),
 state:handle(async(_req,res)=>{res.json({success:true,data:await attendanceOperations.state()})}),
 events:handle(async(_req,res)=>{res.json({success:true,data:await attendanceOperations.events()})}),
 policy:handle(async(req,res)=>{res.json({success:true,data:await attendanceOperations.configure(actor(res).accountId!,req.body)})}),
 saveEvent:handle(async(req,res)=>{const id=req.params.id==null?null:Number(req.params.id);if(id!==null&&(!Number.isSafeInteger(id)||id<1))throw new HttpError(422,'EVENT_ID_INVALID','Choose a valid event.');res.json({success:true,data:await attendanceOperations.saveEvent(actor(res).accountId!,id,req.body)})}),
 cancelEvent:handle(async(req,res)=>{const id=Number(req.params.id),version=Number(req.body?.version);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(version)||version<1)throw new HttpError(422,'EVENT_ID_INVALID','Choose a valid event and version.');res.json({success:true,data:await attendanceOperations.cancelEvent(actor(res).accountId!,id,version)})}),
 updateCapacity:handle(async(req,res)=>{res.json({success:true,message:'Library capacity updated.',data:await attendanceService.updateCapacity(actor(res),req.body)})}),
}
