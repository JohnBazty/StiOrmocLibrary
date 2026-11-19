/** Synthetic preview/test records only. The working dashboard never imports these fixtures. */
import type { DeskOverview, DeskTask, DeskTasks, ReminderPreview } from './desk-dashboard-api'
const now=Date.now()
const row=(id:number,borrower:string,department:string,level:string,program:string,title:string):DeskTask=>({id,kind:'Loan',borrower,schoolId:'PREVIEW-'+id,role:'Student',department,level,program,title,barcode:'PREVIEW-COPY-'+id,date:new Date(now-id*86400000).toISOString(),status:'Overdue',lostReported:false,reminderStatus:null})
export const dashboardPreviewTasks:DeskTasks={generatedAt:new Date(now).toISOString(),page:1,limit:25,total:8,items:[
 row(1,'Ana Flores','SHS','11','STEM','General Biology'),row(2,'Miguel Santos','SHS','12','ABM','Business Finance'),
 row(3,'Lea Cruz','College','1','BSIT','Introduction to Computing'),row(4,'Noel Reyes','College','2','BSIT','Database Systems'),
 row(5,'Carla Diaz','College','3','BSHM','Hospitality Operations'),row(6,'Paolo Ramos','College','4','BSTM','Tourism Planning'),
 {...row(7,'Mara Lim','Other','','','Research Methods'),role:'Faculty'},row(8,'Dina Perez','Other','','','College Algebra'),
]}
export const dashboardPreviewHolds:DeskTasks={generatedAt:new Date(now).toISOString(),page:1,limit:25,total:2,items:[
 {...row(21,'Ella Garcia','SHS','12','HUMSS','Philippine Literature'),kind:'Hold',status:'Preparing'},
 {...row(22,'Ben Lopez','SHS','11','TVL','Computer Systems Servicing'),kind:'Hold',status:'Preparing'},
]}
export const dashboardPreviewOverview:DeskOverview={generatedAt:new Date(now).toISOString(),days:30,counts:{dueToday:12,overdue:8,holds:2,repair:3},
 topBooks:[{id:1,title:'Introduction to Computing',kind:'Book',count:42},{id:2,title:'General Biology',kind:'Book',count:35},{id:3,title:'Hospitality Operations',kind:'Book',count:28},{id:4,title:'Tourism Planning',kind:'Book',count:21},{id:5,title:'Research Methods',kind:'Book',count:17}],
 groups:[{label:'Grade 11',count:52},{label:'Grade 12',count:46},{label:'BSIT',count:73},{label:'BSHM',count:39},{label:'BSTM',count:31},{label:'Faculty / Staff',count:14},{label:'Other / Not recorded',count:3}],
 programs:[...['STEM','ABM','HUMSS','TVL'].map(program=>({department:'SHS',program})),...['BSIT','BSHM','BSTM'].map(program=>({department:'College',program}))],academicBasis:'Current profile details.'}
export const dashboardPreviewReminder:ReminderPreview={items:dashboardPreviewTasks.items,limit:100,channel:'School email',deduplication:'One email per overdue loan or renewal. In-app reminders are tracked separately.'}
