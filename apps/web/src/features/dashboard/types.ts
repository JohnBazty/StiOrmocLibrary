export type LibraryProfile = {
  name: string; seatCapacity: number; information: string | null; mapPath: string | null
  schedule: Array<{ day: number; isOpen: boolean; opensAt: string | null; closesAt: string | null }>
  nextClosure: { date: string; reason: string } | null
}

export type AdminDashboardData = {
  generatedAt: string
  staff: { name: string; schoolId: string }
  profile: LibraryProfile
  kpis: { totalBooks:number;activeBorrowed:number;availableBooks:number;overdueBooks:number;activeUsers:number;dailyAttendance:number;activeReservations:number;outstandingFines:number;returnedToday:number }
  weeklyAttendance: Array<{label:string;value:number}>
  purposeBreakdown: Array<{label:string;value:number}>
  popularCategories: Array<{label:string;value:number}>
  recentCirculation: Array<{id:number;userName:string;schoolId:string;title:string;barcode:string;status:string;eventAt:string}>
  recentActivity: Array<{id:number;type:string;title:string;message:string;createdAt:string}>
  occupancy: {current:number;capacity:number;peakHour:string|null;averageMinutes:number}
}

export type UserDashboardData = {
  generatedAt: string
  user: {name:string;schoolId:string;program:string|null;role:string}
  profile: LibraryProfile
  summary: {activeLoans:number;activeBookCount:number;borrowingLimit:number|null;activeReservations:number;unreadNotifications:number;outstandingFines:number;clearanceStatus:string}
  occupancy: {current:number;capacity:number}
  currentLoan: null|{id:number;title:string;author:string;barcode:string;shelfLocation:string;status:string;dueAt:string;coverPath:string|null}
  reservation: null|{id:number;title:string;coverPath:string|null;queuePosition:number;status:string;pickupDeadline:string|null}
  printRequest: null|{id:number;fileName:string;copies:number;printType:string;cost:number;status:string;createdAt:string}
  latestNotification: null|{id:number;title:string;message:string;type:string;actionPath:string|null;createdAt:string}
  announcement: null|{id:number;title:string;message:string;priority:string;publishedAt:string}
  recentHistory:Array<{id:number;title:string;coverPath:string|null;status:string;eventAt:string}>
  recommendations:Array<{id:number;title:string;author:string;availableCopies:number;coverPath:string|null}>
}
