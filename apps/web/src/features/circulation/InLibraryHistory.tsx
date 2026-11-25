import { useEffect, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { deskCirculationApi, type InLibraryUse } from './desk-circulation-api'

export function InLibraryHistory() {
  const [rows, setRows] = useState<InLibraryUse[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await deskCirculationApi.mine()
        if (active) { setRows(r); setError('') }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'In-library history unavailable.')
      } finally {
        if (active) setLoaded(true)
      }
    }
    void load()
    const timer = setInterval(() => void load(), 30000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  return (
    <SectionCard className="mt-5 overflow-hidden">
      <div className="border-b border-[var(--sl-border)] px-5 py-3.5">
        <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">My in-library use</h2>
        <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">In-library assignments are separate from take-home loans.</p>
      </div>
      {error ? (
        <div className="p-4"><NoticeBanner tone="error" className="mb-0">{error}</NoticeBanner></div>
      ) : !loaded ? (
        <p className="p-5 text-sm text-[var(--sl-text-secondary)]">Loading in-library history…</p>
      ) : rows.length ? (
        <ResponsiveTable label="My in-library use">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                <th scope="col" className="px-5 py-3">Title</th>
                <th scope="col" className="px-5 py-3">Barcode</th>
                <th scope="col" className="px-5 py-3">Hand back by</th>
                <th scope="col" className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {rows.map(r => (
                <tr key={r.use_id}>
                  <td className="px-5 py-3.5 font-semibold text-[var(--sl-text-header)]">{r.title}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-[var(--sl-text-secondary)]">{r.barcode}</td>
                  <td className="px-5 py-3.5 tabular-nums text-[var(--sl-text-secondary)]">
                    {new Date(r.hand_back_by).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={r.status === 'Review' ? 'Hand-back missing' : r.status} tone={r.status === 'Review' ? 'warning' : undefined} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      ) : (
        <p className="p-5 text-sm text-[var(--sl-text-muted)]">No in-library use recorded. In-library assignments are separate from take-home loans.</p>
      )}
    </SectionCard>
  )
}
