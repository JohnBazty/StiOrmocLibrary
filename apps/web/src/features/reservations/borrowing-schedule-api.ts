import { reservationRequest } from './reservation-api'
export type BorrowingSchedule={scheduleId:number;titleId:number;title:string;pickupDate:string;status:'scheduled'|'prepared'|'cancelled'|'unfulfilled';reservationId:number|null;reason:string|null}
export type AdminBorrowingSchedule={scheduleId:number;titleId:number;title:string;userName:string;schoolId:string;userRole:string;pickupDate:string;requestedAt:string;preparationStartsAt:string|null;reason:string|null}
export type ScheduleQueueFilters={user:string;role:string;dateFrom:string;dateTo:string}
export type ScheduleQueue={available:boolean;items:AdminBorrowingSchedule[];pagination:{page:number;limit:number;total:number;pages:number}}
const base='/api/v1/borrowing-schedules'
export const borrowingScheduleApi={
 queue:(filters:ScheduleQueueFilters,page=1,signal?:AbortSignal)=>reservationRequest<ScheduleQueue>(`/api/v1/admin/borrowing-schedules?${new URLSearchParams({...filters,page:String(page),limit:'25'})}`,{signal}),
 dates:()=>reservationRequest<{available:boolean;dates:string[]}>(`${base}/dates`),
 mine:()=>reservationRequest<BorrowingSchedule[]>(base),
 create:(input:{titleId:number;pickupDate:string;clientRequestId:string})=>reservationRequest<BorrowingSchedule>(base,{method:'POST',body:JSON.stringify(input)}),
 cancel:(id:number)=>reservationRequest<BorrowingSchedule>(`${base}/${id}/cancel`,{method:'PUT'}),
}
export const pickupDateLabel=(date:string)=>new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric'})
