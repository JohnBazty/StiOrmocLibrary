import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AdminAttendancePage } from './attendance/AdminAttendancePage'
import { StaffAttendancePage } from './attendance/StaffAttendancePage'
import { UserAttendancePage } from './attendance/UserAttendancePage'
import { LibraryOperationsPanel } from './attendance/LibraryOperationsPanel'
import { AdminCirculationMonitor } from './circulation/AdminCirculationMonitor'
import { BorrowingHistory } from './circulation/BorrowingHistory'
import { AdminClearancePage } from './clearance/AdminClearancePage'
import { StudentClearancePage } from './clearance/StudentClearancePage'
import { AdminAccountDashboardPage } from './dashboard/AdminAccountDashboardPage'
import { AdminDashboardPage } from './dashboard/AdminDashboardPage'
import { UserDashboardPage } from './dashboard/UserDashboardPage'
import { WorkspaceTasks } from './dashboard/WorkspaceTasks'
import { AdminFinesPage } from './fines/AdminFinesPage'
import { StudentFinesPage } from './fines/StudentFinesPage'
import { FloorPlanImagePage } from './floor-plan/FloorPlanImagePage'
import { InventoryDashboard } from './inventory/InventoryDashboard'
import { AdminAnnouncementsPage } from './notifications/AdminAnnouncementsPage'
import { AdminNotificationsPage } from './notifications/AdminNotificationsPage'
import { LibraryActivityPage } from './notifications/LibraryActivityPage'
import { NotificationCenterPage } from './notifications/NotificationCenterPage'
import { AdminPrintingQueuePage } from './printing/AdminPrintingQueuePage'
import { AdminPrintSuppliesPage } from './printing/AdminPrintSuppliesPage'
import { StaffPrintingQueuePage } from './printing/StaffPrintingQueuePage'
import { StudentPrintingPage } from './printing/StudentPrintingPage'
import { AdminReservationQueuePage } from './reservations/AdminReservationQueuePage'
import { StudentReservations } from './reservations/StudentReservations'
import { AdminUsersPage } from './users/AdminUsersPage'
import { EnrollmentPage } from './users/EnrollmentPage'
import { CollectionReviewPage } from './catalog/CollectionReviewPage'
import { BookCatalog } from './catalog/BookCatalog'
import { StockItemsPanel } from './inventory/StockItemsPanel'
import { HistoricalPrintingPage } from './printing/HistoricalPrintingPage'
import { SupplyDetailsPanel } from './printing/SupplyDetailsPanel'

// Verify a user can retry real page reads after the server responds with an error.
const controls = [
  [<AdminAttendancePage />, 'Refresh'], [<StaffAttendancePage />, 'Refresh'], [<UserAttendancePage />, 'Refresh'], [<LibraryOperationsPanel />, 'Refresh operations'],
  [<AdminCirculationMonitor />, 'Refresh'], [<BorrowingHistory />, 'Refresh'], [<AdminClearancePage />, 'Refresh'], [<StudentClearancePage />, 'Refresh'],
  [<AdminAccountDashboardPage />, 'Refresh'], [<AdminDashboardPage />, 'Try again'], [<UserDashboardPage />, 'Try again'], [<WorkspaceTasks />, 'Refresh tasks'],
  [<AdminFinesPage />, 'Refresh'], [<StudentFinesPage />, 'Refresh'], [<FloorPlanImagePage />, 'Refresh'], [<InventoryDashboard />, 'Refresh'],
  [<AdminAnnouncementsPage />, 'Refresh'], [<AdminNotificationsPage />, 'Refresh'], [<LibraryActivityPage />, 'Refresh'], [<NotificationCenterPage />, 'Refresh'], [<NotificationCenterPage operations />, 'Refresh'],
  [<AdminPrintingQueuePage />, 'Refresh'], [<AdminPrintSuppliesPage />, 'Refresh'], [<StaffPrintingQueuePage />, 'Refresh'], [<StudentPrintingPage />, 'Refresh'],
  [<AdminReservationQueuePage />, 'Refresh'], [<StudentReservations />, 'Refresh'], [<AdminUsersPage />, 'Refresh'], [<AdminUsersPage archive />, 'Refresh'], [<EnrollmentPage />, 'Refresh'],
  [<CollectionReviewPage />, 'Refresh'], [<BookCatalog />, 'Refresh catalog'], [<StockItemsPanel kind="merchandise" />, 'Reload records'],
  [<HistoricalPrintingPage />, 'Reload records'], [<SupplyDetailsPanel />, 'Reload records'],
] as const

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
for (const [view, label] of controls) it(`${view.type.name} ${JSON.stringify(view.props)} ${label} requests fresh data`, async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => Response.json({success:false,message:'Fixture read unavailable'}, {status:503}))
  vi.stubGlobal('fetch', fetch)
  render(<MemoryRouter>{view}</MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  const before = fetch.mock.calls.length
  expect(before).toBeGreaterThan(0)
  const button = screen.getByRole('button', { name: label }) as HTMLButtonElement
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  const fresh = fetch.mock.calls.slice(before)
  expect(fresh.length).toBeGreaterThan(0)
  expect(fresh.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true)
})
