export type ReservationStatus = 'pending' | 'approved' | 'ready_for_pickup' | 'claimed' | 'cancelled' | 'expired'
export type RequestHistoryItem = { requestKind?:'Reservation'|'CartHandover'; reservationId:number;title:string;titleId?:number|null;coverImagePath:string|null;queuePosition:number;status:ReservationStatus;reservedAt:string;pickupDeadline:string|null;accessionNumber:string|null;barcode:string|null;conditionStatus:string|null;statusLabel?:string;instructions?:string;emailStatus?:string|null;events?:Array<{status:string;at:string}> }
export type ReservationQueueItem = {
  reservationId: number; userId: number; userName: string; institutionalId: string; email: string
  userRole: 'Student' | 'Faculty'; materialId: number; materialTitle: string; materialType: string
  categoryName: string | null; accessionId: number | null; accessionNumber: string | null; barcode: string | null
  queuePosition: number; status: ReservationStatus; reservedAt: string; pickupDeadline: string | null
  assignedCopyId?:number|null;shelfLocation?:string|null;statusLabel?:string;emailStatus?:string|null
}
export type ReservationFilters = { status: string; dateFrom: string; dateTo: string; user: string; role: string }

