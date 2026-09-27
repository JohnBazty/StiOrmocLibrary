import { Router } from 'express'
import { attendanceController } from './attendance.controller.ts'
export const attendanceRouter=Router()
attendanceRouter.use((request,response,next)=>{
  if(response.locals.authenticatedUser?.role!=='Staff')return next()
  const allowed=(request.method==='GET'&&['/logs','/summary'].includes(request.path))
    ||(request.method==='POST'&&['/scan/resolve','/scan/check-in','/scan/check-out'].includes(request.path))
  return allowed?next():response.status(403).json({success:false,code:'STAFF_ATTENDANCE_FORBIDDEN',message:'Staff may use attendance scans and view attendance records only.'})
})
attendanceRouter.get('/academic-terms',attendanceController.terms)
attendanceRouter.get('/summary',attendanceController.summary)
attendanceRouter.get('/analytics',attendanceController.analytics)
attendanceRouter.get('/logs',attendanceController.logs)
attendanceRouter.get('/report.pdf',attendanceController.pdf)
attendanceRouter.get('/capacity',attendanceController.capacity)
attendanceRouter.patch('/capacity',attendanceController.updateCapacity)
attendanceRouter.post('/scan/resolve',attendanceController.resolve)
attendanceRouter.post('/scan/check-in',attendanceController.checkIn)
attendanceRouter.post('/scan/check-out',attendanceController.checkOut)
export const adminAttendanceV1Router=attendanceRouter

export const userAttendanceV1Router=Router()
userAttendanceV1Router.get('/pass',attendanceController.myPass)
userAttendanceV1Router.get('/pass.png',attendanceController.passPng)
