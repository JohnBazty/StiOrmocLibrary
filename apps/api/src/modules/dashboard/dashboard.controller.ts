import type { NextFunction, Request, Response } from 'express'
import { createBrandedTablePdf } from '../reports/branded-table-pdf.ts'
import { dashboardRepository } from './dashboard.repository.ts'

function actor(request: Request, response: Response) {
  const jwt = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: string } | undefined
  const session = request.session?.user as { id?: number; accountId?: number; role?: string } | undefined
  return { accountId: Number(jwt?.accountId ?? jwt?.id ?? session?.accountId ?? session?.id), role: String(jwt?.role ?? session?.role ?? '') }
}

const handle = (action: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => action(request, response).catch(next)

async function* summaryRows(data: Awaited<ReturnType<typeof dashboardRepository.admin>>) {
  const rows = [
    ['Total active book copies', data.kpis.totalBooks], ['Available book copies', data.kpis.availableBooks],
    ['Active borrowed books', data.kpis.activeBorrowed], ['Overdue books', data.kpis.overdueBooks],
    ['Returned today', data.kpis.returnedToday], ['Active user accounts', data.kpis.activeUsers],
    ['Attendance today', data.kpis.dailyAttendance], ['Active reservations', data.kpis.activeReservations],
    ['Outstanding fines', `PHP ${data.kpis.outstandingFines.toFixed(2)}`],
    ['Current occupancy', `${data.occupancy.current} of ${data.occupancy.capacity}`],
    ['Peak hour today', data.occupancy.peakHour ?? 'No visits yet'], ['Average visit', `${data.occupancy.averageMinutes} minutes`],
  ]
  for (const [metric, value] of rows) yield { section: 'Operational summary', metric, value }
  for (const item of data.weeklyAttendance) yield { section: 'Weekly attendance', metric: item.label, value: item.value }
  for (const item of data.popularCategories) yield { section: 'Popular categories (30 days)', metric: item.label, value: `${item.value} borrows` }
}

export const dashboardController = {
  admin: handle(async (request, response) => {
    const data = await dashboardRepository.admin(actor(request, response))
    response.set('Cache-Control', 'private, no-store').json({ success: true, message: 'Dashboard loaded.', data })
  }),
  user: handle(async (request, response) => {
    const data = await dashboardRepository.user(actor(request, response))
    response.set('Cache-Control', 'private, no-store').json({ success: true, message: 'Dashboard loaded.', data })
  }),
  adminPdf: handle(async (request, response) => {
    const data = await dashboardRepository.admin(actor(request, response))
    const report = createBrandedTablePdf(summaryRows(data), {
      title: 'ADMIN DASHBOARD SUMMARY',
      subtitle: `Generated ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date())} | Live operational totals`,
      emptyMessage: 'No dashboard metrics are available.',
      columns: [{ key: 'section', label: 'SECTION', width: 220 }, { key: 'metric', label: 'METRIC', width: 300 }, { key: 'value', label: 'VALUE', width: 180 }],
    })
    response.status(200).set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="smartlib-dashboard-summary.pdf"', 'Cache-Control': 'private, no-store' })
    report.pipe(response)
  }),
}
