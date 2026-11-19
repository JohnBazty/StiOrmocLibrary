import { afterEach, describe, expect, it } from 'vitest'
import {
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  loadWorkspaceLayoutPrefs,
  saveWorkspaceLayoutPrefs,
} from './workspace-layout-prefs'

afterEach(() => {
  window.localStorage.clear()
})

describe('workspace-layout-prefs', () => {
  it('returns default layout preferences when storage is empty', () => {
    expect(loadWorkspaceLayoutPrefs()).toEqual({
      leftCollapsed: false,
      leftWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
      rightOpen: true,
      rightWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
    })
  })

  it('saves and reloads valid layout preferences', () => {
    saveWorkspaceLayoutPrefs({
      leftCollapsed: true,
      leftWidth: 304,
      rightOpen: false,
      rightWidth: 380,
    })
    expect(loadWorkspaceLayoutPrefs()).toEqual({
      leftCollapsed: true,
      leftWidth: 304,
      rightOpen: false,
      rightWidth: 380,
    })
  })

  it('clamps out-of-range widths and recovers from corrupt values', () => {
    expect(clampSidebarWidth(90, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(LEFT_SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(900, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(LEFT_SIDEBAR_MAX_WIDTH)

    window.localStorage.setItem('sti-ilms:layout:left-collapsed', 'invalid')
    window.localStorage.setItem('sti-ilms:layout:left-width', '9999')
    window.localStorage.setItem('sti-ilms:layout:right-open', 'false')
    window.localStorage.setItem('sti-ilms:layout:right-width', '12')

    expect(loadWorkspaceLayoutPrefs()).toEqual({
      leftCollapsed: false,
      leftWidth: LEFT_SIDEBAR_MAX_WIDTH,
      rightOpen: false,
      rightWidth: RIGHT_SIDEBAR_MIN_WIDTH,
    })
  })

  it('falls back to defaults when widths are non-numeric', () => {
    window.localStorage.setItem('sti-ilms:layout:left-width', 'NaN')
    window.localStorage.setItem('sti-ilms:layout:right-width', 'not-a-number')

    expect(loadWorkspaceLayoutPrefs()).toEqual({
      leftCollapsed: false,
      leftWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
      rightOpen: true,
      rightWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
    })
  })
})
