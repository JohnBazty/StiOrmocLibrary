import { HttpError } from '../../core/http-error.ts'
import { attendancePurposes } from './attendance.validation.ts'
import { manilaDate, manilaInstant } from './attendance-intervals.ts'

export type OperationalEvent = {event_id:number;title:string;event_kind:string;space_name:string;starts_at:string;ends_at:string;seat_capacity:number;allow_walk_ins:boolean;allow_borrowing:boolean;allow_printing:boolean;row_version:number}
export type AttendancePolicy = {servicePurposes:string[];preclosingMinutes:number|null;configured:boolean;version:number}
export function parseOperationalEvent(value:unknown) {
 const b=(value&&typeof value==='object'?value:{}) as Record<string,unknown>
 const title=String(b.title??'').trim(),space=String(b.spaceName??'').trim(),kind=String(b.kind??''),start=new Date(String(b.startsAt??'')),end=new Date(String(b.endsAt??'')),capacity=Number(b.capacity)
 if(!title||title.length>150||!space||space.length>150||!['Class','Meeting','Seminar'].includes(kind))throw new HttpError(422,'EVENT_INVALID','Enter an event title, affected space and valid event type.')
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||!/[zZ]|[+-]\d\d:\d\d$/.test(String(b.startsAt))||!/[zZ]|[+-]\d\d:\d\d$/.test(String(b.endsAt)))throw new HttpError(422,'EVENT_TIME_INVALID','Enter valid event start/end times with a timezone.')
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>5000)throw new HttpError(422,'EVENT_CAPACITY_INVALID','Enter remaining seat capacity from 0 to 5000.')
 for(const flag of ['allowWalkIns','allowBorrowing','allowPrinting'])if(typeof b[flag]!=='boolean')throw new HttpError(422,'EVENT_SERVICES_REQUIRED','Specify each permitted service.')
 if(b.version!==undefined&&(!Number.isSafeInteger(Number(b.version))||Number(b.version)<1))throw new HttpError(422,'EVENT_VERSION_INVALID','Refresh the event before saving.')
 return {title,space,kind,start,end,capacity,allowWalkIns:Boolean(b.allowWalkIns),allowBorrowing:Boolean(b.allowBorrowing),allowPrinting:Boolean(b.allowPrinting),version:Number(b.version)}
}
export function parseAttendancePolicy(value:unknown) {
 const b=(value&&typeof value==='object'?value:{}) as Record<string,unknown>,purposes=b.servicePurposes,minutes=Number(b.preclosingMinutes)
 if(!Array.isArray(purposes)||!purposes.includes('Printing')||purposes.some(p=>!attendancePurposes.includes(p)))throw new HttpError(422,'ATTENDANCE_POLICY_INVALID','Printing must remain a service visit; choose only supported purposes.')
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>60)throw new HttpError(422,'ATTENDANCE_CUTOFF_INVALID','Choose a cutoff 1–60 minutes before closing.')
 if(!Number.isSafeInteger(Number(b.version))||Number(b.version)<1)throw new HttpError(422,'ATTENDANCE_POLICY_VERSION_INVALID','Refresh the policy before saving.')
 return {purposes:[...new Set(purposes)] as string[],minutes,version:Number(b.version)}
}
export function evaluateLibraryState(now:Date, policy:AttendancePolicy, schedule:{is_open:number;opens_at:string|null;closes_at:string|null}|undefined,closed:boolean,baseCapacity:number,events:OperationalEvent[]) {
 const date=manilaDate(now),openAt=schedule?.opens_at?manilaInstant(date,schedule.opens_at):null,closeAt=schedule?.closes_at?manilaInstant(date,schedule.closes_at):null
 const cutoff=closeAt&&policy.preclosingMinutes?new Date(closeAt.getTime()-policy.preclosingMinutes*60000):null
 const hoursOpen=Boolean(schedule?.is_open&&!closed&&openAt&&closeAt&&now>=openAt&&now<closeAt)
 const entryOpen=Boolean(policy.configured&&hoursOpen&&cutoff&&now<cutoff)
 const capacity=Math.max(0,Math.min(baseCapacity,...events.map(e=>Number(e.seat_capacity))))
 return {state:!policy.configured?'Needs configuration':!hoursOpen?'Closed':!entryOpen?'Closing':events.length?'Scheduled event':'Open',entryOpen,hoursOpen,capacity,cutoffAt:cutoff?.toISOString()??null,closesAt:closeAt?.toISOString()??null,allowWalkIns:entryOpen&&events.every(e=>e.allow_walk_ins),allowBorrowing:entryOpen&&events.every(e=>e.allow_borrowing),allowPrinting:entryOpen&&events.every(e=>e.allow_printing),events,timezone:'Asia/Manila'}
}
