import { useCallback, useMemo, useSyncExternalStore } from 'react'

export const LIVE_REFRESH_MS = 30_000
const RETRY_BASE_MS = 1_000
type Snapshot<T> = { data: T | undefined; error: Error | null; loading: boolean }
type Entry<T> = {
  key: string
  read: (signal: AbortSignal) => Promise<T>
  snapshot: Snapshot<T>
  listeners: Set<() => void>
  flight: Promise<T | undefined> | null
  controller: AbortController | null
  timer: ReturnType<typeof setTimeout> | null
  failures: number
  generation: number
  startedAt: number
  poll: boolean
}
// Keys describe identical reads within the current workspace. Entries and data are
// discarded when their last consumer leaves, including at the logout boundary.
const entries = new Map<string, Entry<unknown>>()
const visible = () => !document.hidden && navigator.onLine !== false

function publish<T>(entry: Entry<T>, snapshot: Snapshot<T>) {
  entry.snapshot = snapshot
  entry.listeners.forEach(listener => listener())
}
function schedule<T>(entry: Entry<T>) {
  if (entry.timer) clearTimeout(entry.timer)
  if (!entry.poll || !entry.listeners.size || !visible()) return
  const delay = entry.failures ? Math.min(LIVE_REFRESH_MS, RETRY_BASE_MS * 2 ** entry.failures) : LIVE_REFRESH_MS
  entry.timer = setTimeout(() => { entry.timer = null; void run(entry) }, Math.max(0, entry.startedAt + delay - Date.now()))
}
function run<T>(entry: Entry<T>): Promise<T | undefined> {
  if (entry.flight) return entry.flight
  if (!entry.listeners.size || !visible()) return Promise.resolve(undefined)
  const generation = entry.generation
  const controller = new AbortController()
  entry.controller = controller
  entry.startedAt = Date.now()
  // Defer the read so synchronous exceptions also reach the normal error path.
  entry.flight = Promise.resolve().then(() => entry.read(controller.signal)).then(data => {
    if (generation !== entry.generation || controller.signal.aborted || !entry.listeners.size) return undefined
    entry.failures = 0
    publish(entry, { data, error: null, loading: false })
    return data
  }).catch((cause: unknown) => {
    if (generation !== entry.generation || controller.signal.aborted || !entry.listeners.size) return undefined
    entry.failures++
    publish(entry, { ...entry.snapshot, error: cause instanceof Error ? cause : new Error('Updates are temporarily unavailable. Try again.'), loading: false })
    return undefined
  }).finally(() => {
    if (generation !== entry.generation) return
    entry.flight = null
    entry.controller = null
    schedule(entry)
  })
  return entry.flight
}
function stop<T>(entry: Entry<T>) {
  entry.generation++
  entry.controller?.abort()
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  entry.flight = null
  // A disabled/re-enabled consumer must not act on a former account's or cart's
  // stale snapshot before its new authoritative read completes.
  entry.snapshot = { data: undefined, error: null, loading: true }
}

/** Visible reads every LIVE_REFRESH_MS (faster retries after errors), shared by key; never writes or emits activity events. */
export function useLiveQuery<T>(key: string, read: (signal: AbortSignal) => Promise<T>, options: { enabled?: boolean; poll?: boolean; events?: string[] } = {}) {
  const enabled = options.enabled !== false
  const poll = options.poll !== false
  const eventKey = (options.events ?? []).join('\n')
  const entry = useMemo(() => {
    const existing = entries.get(key) as Entry<T> | undefined
    if (existing) return existing
    const created: Entry<T> = { key, read, snapshot: { data: undefined, error: null, loading: true }, listeners: new Set(), flight: null, controller: null, timer: null, failures: 0, generation: 0, startedAt: 0, poll }
    entries.set(key, created as Entry<unknown>)
    return created
  }, [key])
  entry.read = read
  entry.poll = poll
  const refresh = useCallback(async () => {
    // A post-mutation refresh waits out an older read, then reads committed data.
    if (entry.flight) await entry.flight
    return run(entry)
  }, [entry])
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled) return () => {}
    entry.listeners.add(listener)
    entries.set(key, entry as Entry<unknown>)
    const resume = () => {
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = null
      if (visible()) void run(entry)
    }
    const events = eventKey ? eventKey.split('\n') : []
    const refreshAfterEvent = () => { void refresh() }
    // Only the first consumer installs the initial read. Identical consumers share
    // the same in-flight request and timer; mutation events wait out older reads.
    if (entry.listeners.size === 1) void run(entry)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    document.addEventListener('visibilitychange', resume)
    events.forEach(event => window.addEventListener(event, refreshAfterEvent))
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', resume)
      document.removeEventListener('visibilitychange', resume)
      events.forEach(event => window.removeEventListener(event, refreshAfterEvent))
      entry.listeners.delete(listener)
      if (!entry.listeners.size) { stop(entry); if (entries.get(key) === entry) entries.delete(key) }
    }
  }, [entry, key, enabled, eventKey, refresh])
  const snapshot = useSyncExternalStore(subscribe, () => entry.snapshot)
  const update = useCallback((change: T | ((current: T | undefined) => T | undefined)) => {
    const data = typeof change === 'function' ? (change as (current: T | undefined) => T | undefined)(entry.snapshot.data) : change
    publish(entry, { ...entry.snapshot, data })
  }, [entry])
  return { ...snapshot, refresh, update }
}
