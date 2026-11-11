import { Component, type ReactNode } from 'react'

/** Catches a page that fails to load (for example an old chunk after a deploy) so the screen is never blank. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div role="alert" className="flex min-h-screen items-center justify-center bg-[#003399]/5 p-6 text-center"><div><h1 className="font-display text-2xl font-bold text-[#003399]">This page could not be loaded.</h1><p className="mt-2 text-sm text-[#003399]/65">The library system may have been updated, or your connection dropped. Reload to try again.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex rounded-xl bg-[#003399] px-4 py-2.5 text-sm font-bold text-[#FFFFFF]">Reload page</button></div></div>
  }
}
