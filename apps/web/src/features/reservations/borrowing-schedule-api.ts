import { reservationRequest } from './reservation-api'
export type BorrowingSchedule={scheduleId:number;titleId:number;title:string;pickupDate:string;status:'scheduled'|'prepared'|'cancelled'|'unfulfilled';reservationId:number|null;reason:string|null}
const base='/api/v1/borrowing-schedules'
export const borrowingScheduleApi={
 dates:()=>reservationRequest<{available:boolean;dates:string[]}>(`${base}/dates`),
 mine:()=>reservationRequest<BorrowingSchedule[]>(base),
 create:(input:{titleId:number;pickupDate:string;clientRequestId:string})=>reservationRequest<BorrowingSchedule>(base,{method:'POST',body:JSON.stringify(input)}),
 cancel:(id:number)=>reservationRequest<BorrowingSchedule>(`${base}/${id}/cancel`,{method:'PUT'}),
}
export const pickupDateLabel=(date:string)=>new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric'})
