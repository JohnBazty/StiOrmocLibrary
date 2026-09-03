import { Router } from 'express'
import { attendanceController } from './attendance.controller.ts'
export const attendanceRouter=Router()
attendanceRouter.get('/academic-terms',attendanceController.terms)
attendanceRouter.get('/summary',attendanceController.summary)
attendanceRouter.get('/logs',attendanceController.logs)
attendanceRouter.get('/report.pdf',attendanceController.pdf)
export const adminAttendanceV1Router=attendanceRouter
