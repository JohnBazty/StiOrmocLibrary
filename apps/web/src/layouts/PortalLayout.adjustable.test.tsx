import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { PortalLayout } from './PortalLayout'
import {
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_KEYBOARD_STEP,
} from './workspace-layout-prefs'

vi.mock('../features/auth/auth-api', () => ({ logout: vi.fn(async () => undefined) }))
vi.mock('../features/auth/auth-storage', () => ({
  getCsrfToken: () => 'fixture-token',
  getCurrentIdentity: () => ({ role: 'Librarian', schoolId: 'ADMIN-PORTAL-001', userId: 1 }),
}))
vi.mock('../features/auth/SessionActivity', () => ({ SessionActivity: () => null }))
vi.mock('./SidebarAccountCard', () => ({ SidebarAccountCard: () => null }))
vi.mock('../features/attendance/AttendanceFab', () => ({ AttendanceFab: () => null }))

function mockDesktopMatchMedia(isDesktop = true) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width: 1023px') ? !isDesktop : isDesktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function renderPortal(role: 'librarian' | 'staff' | 'student' = 'librarian') {
  return render(
    <MemoryRouter initialEntries={[`/${role}/dashboard`]}>
      <ThemeProvider>
        <Routes>
          <Route element={<PortalLayout role={role} />}>
            <Route
              path={`/${role}/dashboard`}
              element={
                <div>
                  <h1>Workspace content</h1>
                  <input aria-label="Search queue" />
                </div>
              }
            />
          </Route>
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mockDesktopMatchMedia(true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        success: true,
        data: { items: [], unreadCount: 0, request: null, weekly: [], upcomingClosures: [] },
      }),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('PortalLayout adjustable and collapsible sidebars', () => {
  it('hides and restores the left navigation sidebar on desktop to maximize workspace space', () => {
    const { container } = renderPortal('librarian')
    const layout = container.querySelector('.portal-layout') as HTMLElement
    const sidebar = document.getElementById('portal-navigation') as HTMLElement
    const main = screen.getByRole('main')

    expect(layout.style.getPropertyValue('--portal-left-width')).toBe(`${LEFT_SIDEBAR_DEFAULT_WIDTH}px`)
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(main.className).toContain('max-w-[1500px]')

    const hideButton = screen.getByRole('button', { name: 'Hide navigation sidebar' })
    expect(hideButton.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(hideButton)

    const showButton = screen.getByRole('button', { name: 'Show navigation sidebar' })
    expect(showButton.getAttribute('aria-expanded')).toBe('false')
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe('0px')
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(main.className).toContain('max-w-none')

    fireEvent.click(showButton)
    expect(screen.getByRole('button', { name: 'Hide navigation sidebar' }).getAttribute('aria-expanded')).toBe('true')
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe(`${LEFT_SIDEBAR_DEFAULT_WIDTH}px`)
    expect(sidebar.hasAttribute('inert')).toBe(false)
  })

  it('toggles left sidebar with Ctrl+B on desktop without interfering with text inputs', () => {
    renderPortal('librarian')

    const input = screen.getByLabelText('Search queue')
    input.focus()
    fireEvent.keyDown(input, { key: 'b', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Hide navigation sidebar' })).toBeTruthy()

    input.blur()
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Show navigation sidebar' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Hide navigation sidebar' })).toBeTruthy()
  })

  it('resizes the left sidebar via keyboard, pointer drag, drag-to-collapse, and double-click reset', () => {
    const { container } = renderPortal('librarian')
    const layout = container.querySelector('.portal-layout') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize navigation sidebar' })

    expect(handle.getAttribute('aria-valuenow')).toBe(String(LEFT_SIDEBAR_DEFAULT_WIDTH))

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle.getAttribute('aria-valuenow')).toBe(String(LEFT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_KEYBOARD_STEP))
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe(
      `${LEFT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_KEYBOARD_STEP}px`,
    )

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle.getAttribute('aria-valuenow')).toBe(String(LEFT_SIDEBAR_MIN_WIDTH))

    fireEvent.keyDown(handle, { key: 'End' })
    expect(handle.getAttribute('aria-valuenow')).toBe(String(LEFT_SIDEBAR_MAX_WIDTH))

    fireEvent.doubleClick(handle)
    expect(handle.getAttribute('aria-valuenow')).toBe(String(LEFT_SIDEBAR_DEFAULT_WIDTH))

    // Pointer drag widens the sidebar
    fireEvent(handle, new MouseEvent('pointerdown', { clientX: 256, button: 0, bubbles: true }))
    fireEvent(window, new MouseEvent('pointermove', { clientX: 310, bubbles: true }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 310, bubbles: true }))
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe('310px')

    // Dragging below collapse threshold hides the sidebar and remembers the last open width
    fireEvent(handle, new MouseEvent('pointerdown', { clientX: 310, button: 0, bubbles: true }))
    fireEvent(window, new MouseEvent('pointermove', { clientX: 110, bubbles: true }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 110, bubbles: true }))
    expect(screen.getByRole('button', { name: 'Show navigation sidebar' })).toBeTruthy()
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe('0px')

    // Reopening restores the width before dragging shut
    fireEvent.click(screen.getByRole('button', { name: 'Show navigation sidebar' }))
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe('310px')
  })

  it('persists collapsed state and custom sidebar widths across remounts', () => {
    const first = renderPortal('librarian')
    const leftHandle = screen.getByRole('separator', { name: 'Resize navigation sidebar' })
    fireEvent.keyDown(leftHandle, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Hide navigation sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse quick actions sidebar' }))
    first.unmount()

    const second = renderPortal('librarian')
    const layout = second.container.querySelector('.portal-layout') as HTMLElement
    expect(screen.getByRole('button', { name: 'Show navigation sidebar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open quick actions sidebar' })).toBeTruthy()
    expect(layout.style.getPropertyValue('--portal-left-width')).toBe('0px')
    expect(layout.style.getPropertyValue('--portal-left-panel-width')).toBe(
      `${LEFT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_KEYBOARD_STEP}px`,
    )
    expect(layout.style.getPropertyValue('--portal-right-width')).toBe('0px')
  })

  it('resizes the right calendar sidebar on staff workspaces', () => {
    const { container } = renderPortal('librarian')
    const layout = container.querySelector('.portal-layout') as HTMLElement
    const rightHandle = screen.getByRole('separator', { name: 'Resize calendar sidebar' })

    expect(rightHandle.getAttribute('aria-valuenow')).toBe(String(RIGHT_SIDEBAR_DEFAULT_WIDTH))
    fireEvent.keyDown(rightHandle, { key: 'ArrowLeft' })
    expect(rightHandle.getAttribute('aria-valuenow')).toBe(String(RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_KEYBOARD_STEP))
    expect(layout.style.getPropertyValue('--portal-right-width')).toBe(
      `${RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_KEYBOARD_STEP}px`,
    )

    fireEvent.doubleClick(rightHandle)
    expect(rightHandle.getAttribute('aria-valuenow')).toBe(String(RIGHT_SIDEBAR_DEFAULT_WIDTH))
  })
})
