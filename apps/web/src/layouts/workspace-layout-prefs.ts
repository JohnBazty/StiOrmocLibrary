export const LEFT_SIDEBAR_DEFAULT_WIDTH = 256
export const LEFT_SIDEBAR_MIN_WIDTH = 200
export const LEFT_SIDEBAR_MAX_WIDTH = 360
export const LEFT_SIDEBAR_COLLAPSE_THRESHOLD = 140

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320
export const RIGHT_SIDEBAR_MIN_WIDTH = 260
export const RIGHT_SIDEBAR_MAX_WIDTH = 440
export const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD = 180

export const SIDEBAR_KEYBOARD_STEP = 16

const STORAGE_KEYS = {
  leftCollapsed: 'sti-ilms:layout:left-collapsed',
  leftWidth: 'sti-ilms:layout:left-width',
  rightOpen: 'sti-ilms:layout:right-open',
  rightWidth: 'sti-ilms:layout:right-width',
} as const

export type WorkspaceLayoutPrefs = {
  leftCollapsed: boolean
  leftWidth: number
  rightOpen: boolean
  rightWidth: number
}

const DEFAULT_PREFS: WorkspaceLayoutPrefs = {
  leftCollapsed: false,
  leftWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
  rightOpen: true,
  rightWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
}

export function clampSidebarWidth(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)))
}

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return fallback
    return clampSidebarWidth(parsed, min, max)
  } catch {
    return fallback
  }
}

export function loadWorkspaceLayoutPrefs(): WorkspaceLayoutPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }
  return {
    leftCollapsed: readBoolean(STORAGE_KEYS.leftCollapsed, DEFAULT_PREFS.leftCollapsed),
    leftWidth: readWidth(
      STORAGE_KEYS.leftWidth,
      DEFAULT_PREFS.leftWidth,
      LEFT_SIDEBAR_MIN_WIDTH,
      LEFT_SIDEBAR_MAX_WIDTH,
    ),
    rightOpen: readBoolean(STORAGE_KEYS.rightOpen, DEFAULT_PREFS.rightOpen),
    rightWidth: readWidth(
      STORAGE_KEYS.rightWidth,
      DEFAULT_PREFS.rightWidth,
      RIGHT_SIDEBAR_MIN_WIDTH,
      RIGHT_SIDEBAR_MAX_WIDTH,
    ),
  }
}

export function saveWorkspaceLayoutPrefs(prefs: WorkspaceLayoutPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.leftCollapsed, String(prefs.leftCollapsed))
    window.localStorage.setItem(
      STORAGE_KEYS.leftWidth,
      String(clampSidebarWidth(prefs.leftWidth, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)),
    )
    window.localStorage.setItem(STORAGE_KEYS.rightOpen, String(prefs.rightOpen))
    window.localStorage.setItem(
      STORAGE_KEYS.rightWidth,
      String(clampSidebarWidth(prefs.rightWidth, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH)),
    )
  } catch {
    // Ignore storage write failures (private browsing or quota limits).
  }
}
