import type { NextFunction,Request,Response } from 'express'
import { createBrandedTablePdf } from '../reports/branded-table-pdf.ts'
import { attendanceRepository } from './attendance.repository.ts'
import { parseAttendanceFilters } from './attendance.validation.ts'
const handle=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)}
export const attendanceController={
 terms:handle(async(_req,res)=>{res.json({success:true,data:await attendanceRepository.terms()})}),
 summary:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f);res.json({success:true,data:await attendanceRepository.summary(f,r)})}),
 logs:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f),result=await attendanceRepository.logs(f,r);res.json({success:true,data:result.rows,meta:{pagination:result.pagination,range:r}})}),
 pdf:handle(async(req,res)=>{const f=parseAttendanceFilters(req.query),r=await attendanceRepository.range(f),summary=await attendanceRepository.summary(f,r);const report=createBrandedTablePdf(attendanceRepository.reportRows(f,r),{title:'ATTENDANCE REPORT',subtitle:`${r.label} | Visits: ${summary.total_visits??0} | Unique visitors: ${summary.unique_visitors??0}`,emptyMessage:'No attendance records match the selected filters.',columns:[{key:'visitor_name',label:'VISITOR',width:180},{key:'school_id',label:'SCHOOL ID',width:110},{key:'role',label:'ROLE',width:80},{key:'attendance_date',label:'DATE',width:90},{key:'time_in',label:'TIME IN',width:80},{key:'time_out',label:'TIME OUT',width:80},{key:'purpose',label:'PURPOSE',width:125},{key:'presence',label:'PRESENCE',width:75}]});res.status(200).set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="smartlib-attendance-${f.period}-${r.from}.pdf"`,'Cache-Control':'no-store'});report.pipe(res)})
}
