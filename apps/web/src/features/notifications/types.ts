export type NotificationItem = {
  notificationId: number; title: string; body: string; type: string; sourceType: string | null; sourceId: number | null
  actionPath: string | null; priority: 'Normal' | 'Important' | 'Urgent'; isRead: boolean; createdAt: string; readAt: string | null; expiresAt: string | null
}
export type NotificationList = { items: NotificationItem[]; unreadCount: number; pagination: { page: number; limit: number; total: number; totalPages: number } }
export type LibraryActivityList = {
  items: Array<{id:string;category:string;title:string;body:string;person:string;schoolId:string;resource:string;reference:string;createdAt:string;actionPath:string}>
  hasMore: boolean; category: string; timezone: string
}
export type LibrarySchedule = {
  timezone: string
  weekly: Array<{ dayOfWeek: number; isOpen: boolean; opensAt: string | null; closesAt: string | null }>
  upcomingClosures: Array<{ date: string; reason: string }>
}
export type Announcement = {
  announcementId: number; title: string; body: string; priority: string; status: string; publishAt: string | null
  expiresAt: string | null; publishedAt: string | null; archivedAt: string | null; createdAt: string; createdBy: string
  deliveredCount: number; readCount: number
}
