export type ReservationStatus = 'pending' | 'approved' | 'ready_for_pickup' | 'claimed' | 'cancelled' | 'expired'
export type ReservationQueueItem = {
  reservationId: number; userId: number; userName: string; institutionalId: string; email: string
  userRole: 'Student' | 'Faculty'; materialId: number; materialTitle: string; materialType: string
  categoryName: string | null; accessionId: number | null; accessionNumber: string | null; barcode: string | null
  queuePosition: number; status: ReservationStatus; reservedAt: string; pickupDeadline: string | null
}
export type ReservationFilters = { status: string; dateFrom: string; dateTo: string; user: string; role: string }

