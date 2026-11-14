import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * "You have unsaved changes" guard (plan 2026-11-13-find-book-details).
 * Wrap a form in <UnsavedGuard>; typing inside marks it changed. While changed, in-app links, the browser Back button and
 * closing through `request(...)` ask Save changes / Discard changes / Keep editing. Closing the browser tab gets the
 * browser's own question, because browsers allow no custom buttons there.
 */
type Guard = { id: number; isDirty: () => boolean; ask: (proceed: () => void) => void; discard: () => void }
const active: Guard[] = []
let installed = false
let bypass = false

// The most recently added changed guard answers; nested guards therefore never show two dialogs.
const current = () => [...active].reverse().find((guard) => guard.isDirty())

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('click', (event) => {
    if (bypass || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!link || link.target === '_blank' || link.hasAttribute('download') || link.origin !== window.location.origin) return
    // File links (/api/...) and same-page anchors do not leave the page, so they never ask.
    if (link.pathname.startsWith('/api/') || (link.pathname === window.location.pathname && link.search === window.location.search && link.hash)) return
    const guard = current()
    if (!guard) return
    event.preventDefault(); event.stopPropagation()
    guard.ask(() => { bypass = true; try { link.click() } finally { bypass = false } })
  }, true)
  window.addEventListener('popstate', () => {
    // The one popstate a Discard caused: let it through.
    if (bypass) { bypass = false; return }
    const guard = current()
    if (!guard) return
    // Back was pressed: stay on this page (re-add the guard entry) and ask; leaving goes back past it.
    window.history.pushState(window.history.state, '', window.location.href)
    guard.ask(() => {
      // A page opened in a new tab has nothing before it: discarding then simply stays here.
      if (window.history.length > 2) { bypass = true; window.history.go(-2) }
    })
  })
  window.addEventListener('beforeunload', (event) => {
    if (!current()) return
    event.preventDefault(); event.returnValue = ''
  })
}

/** For navigation that is not a link (tabs, buttons): asks the open guard with changes first, if there is one. */
export function confirmLeave(proceed: () => void) {
  const guard = current()
  if (guard) guard.ask(proceed)
  else proceed()
}

type GuardApi = { dirty: boolean; request: (proceed: () => void) => void; markClean: () => void }
const GuardContext = createContext<GuardApi>({ dirty: false, request: (proceed) => proceed(), markClean: () => undefined })
/** Inside an UnsavedGuard: `request(close)` asks first when there are unsaved changes; `markClean()` after a successful save. */
export const useUnsavedGuard = () => useContext(GuardContext)

let nextId = 1

export function UnsavedGuard({ children, dirty: forced = false, onSave, resetKey, className, cleanOnSubmit = false }: {
  children: ReactNode
  /** Changes the guard cannot see as typing, for example values filled by a lookup. */
  dirty?: boolean
  /** Saves and resolves true on success; without it, "Save changes" presses the form's own save button and stays. */
  onSave?: () => Promise<boolean>
  /** Changing this value (after a successful save) clears the changed state. */
  resetKey?: unknown
  className?: string
  /** Clear after the form's own save succeeds (see `submitted`). */
  cleanOnSubmit?: boolean
}) {
  const [typed, setTyped] = useState(false)
  const [pending, setPending] = useState<null | (() => void)>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const dirty = typed || forced
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const armed = useRef(false)
  const ask = useCallback((proceed: () => void) => setPending(() => proceed), [])

  useEffect(() => { setTyped(false) }, [resetKey])
  useEffect(() => {
    install()
    const guard: Guard = { id: nextId++, isDirty: () => dirtyRef.current, ask, discard: () => { dirtyRef.current = false; setTyped(false) } }
    active.push(guard)
    return () => { active.splice(active.indexOf(guard), 1) }
  }, [ask])
  // One extra history entry lets Back be caught. shortcut: it stays after a save, so the next Back stays on this page once.
  useEffect(() => {
    if (dirty && !armed.current) { armed.current = true; window.history.pushState(window.history.state, '', window.location.href) }
  }, [dirty])
  useEffect(() => { if (pending) keep.current?.focus() }, [pending])

  const markClean = useCallback(() => setTyped(false), [])
  const request = useCallback((proceed: () => void) => { if (dirtyRef.current) ask(proceed); else proceed() }, [ask])

  // Leaving discards every open form on the page, not only the one that asked.
  const leave = () => { const proceed = pending; setPending(null); for (const guard of [...active]) guard.discard(); proceed?.() }
  async function save() {
    if (!onSave) {
      // No save function: press the form's own save button; its checks and messages apply, and the page stays.
      setPending(null)
      box.current?.querySelector('form')?.requestSubmit()
      return
    }
    setSaving(true)
    let saved = false
    try { saved = await onSave() } catch { saved = false } finally { setSaving(false) }
    setPending(null)
    if (!saved) return
    dirtyRef.current = false; setTyped(false)
    // Another form on the page still has changes: stay, so the next attempt asks about that one.
    if (current()) return
    pending?.()
  }

  /**
   * cleanOnSubmit: the form's own save. Its page shows a refusal as role="alert" and success as role="status" (or closes
   * the form), so the changes count as saved only on one of those; a refusal, or no answer within 8 seconds, keeps them.
   */
  function submitted() {
    const shown = (role: string) => new Set(document.querySelectorAll(`[role="${role}"]`))
    const alerts = shown('alert'), statuses = shown('status'), form = box.current?.querySelector('form')
    // A message that was not on the page before the submit is this save's answer.
    const fresh = (role: string, before: Set<Element>) => [...shown(role)].some((element) => !before.has(element) && element.textContent?.trim())
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (fresh('alert', alerts) || Date.now() - started > 8000) { window.clearInterval(timer); return }
      if (!form || !form.isConnected || fresh('status', statuses)) { window.clearInterval(timer); setTyped(false) }
    }, 150)
  }

  const markTyped = (event: { target: EventTarget }) => {
    if (!(event.target as Element).closest?.('[data-unsaved-ignore]')) setTyped(true)
  }

  return <GuardContext.Provider value={{ dirty, request, markClean }}>
    <div ref={box} className={className} onInputCapture={markTyped} onChangeCapture={markTyped} onSubmitCapture={cleanOnSubmit ? submitted : undefined}>{children}</div>
    {pending ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b5ea2]/70 p-4" onKeyDown={(event) => { if (event.key === 'Escape') setPending(null) }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-text" className="w-full max-w-md rounded-2xl bg-[#FFFFFF] p-5 text-[#0b5ea2] shadow-2xl dark:bg-[#22232e] dark:text-[#f2f6ff]">
        <h2 id="unsaved-title" className="text-lg font-black">You have unsaved changes</h2>
        <p id="unsaved-text" className="mt-2 text-sm">Save them before leaving, or discard them. Discarded changes cannot be recovered.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" ref={keep} disabled={saving} onClick={() => setPending(null)} className="h-11 rounded-xl px-4 text-sm font-bold underline disabled:opacity-50">Keep editing</button>
          <button type="button" disabled={saving} onClick={leave} className="h-11 rounded-xl border border-[#0b5ea2] px-4 text-sm font-bold disabled:opacity-50 dark:border-white/40">Discard changes</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div> : null}
  </GuardContext.Provider>
}
