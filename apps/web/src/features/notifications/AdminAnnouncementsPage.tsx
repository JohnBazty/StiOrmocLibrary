import { AlertTriangle, Megaphone, RefreshCw, Send } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { notificationApi } from './notification-api'
import type { Announcement } from './types'

const input = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10'
function format(value: string | null) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }

export function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setItems(await notificationApi.announcements()); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Announcements are unavailable.') } }, [])
  useEffect(() => { void load() }, [load])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries())
    setBusy(true); setError(''); setNotice('')
    try {
      await notificationApi.createAnnouncement({ title: String(values.title), body: String(values.body), priority: String(values.priority), publishAt: values.publishAt ? new Date(String(values.publishAt)).toISOString() : null, expiresAt: values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null })
      form.reset(); setNotice(values.publishAt ? 'Announcement scheduled for all active users.' : 'Announcement published to all active users.'); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The announcement could not be published.') }
    finally { setBusy(false) }
  }
  return <>
    <PageHeader eyebrow="Admin communication" title="Announcements" description="Only Admin accounts can publish messages to every active SmartLib user." action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    {notice ? <div role="status" className="mb-5 rounded-xl bg-[#003399] p-4 font-bold text-white">{notice}</div> : null}
    <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
      <SectionCard className="p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#FFF200] p-2.5 text-[#003399]"><Megaphone size={20} /></span><div><h2 className="font-display text-lg font-bold text-[#003399]">Post an announcement</h2><p className="text-xs text-[#003399]/60">Audience: all active users</p></div></div><form onSubmit={submit} className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Title</span><input name="title" required minLength={3} maxLength={150} className={input} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Message</span><textarea name="body" required minLength={5} maxLength={5000} rows={7} className={`${input} h-auto py-3`} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Priority</span><select name="priority" className={input}><option>Normal</option><option>Important</option><option>Urgent</option></select></label><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Schedule (optional)</span><input name="publishAt" type="datetime-local" className={input} /></label><label><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Expires (optional)</span><input name="expiresAt" type="datetime-local" className={input} /></label></div><Button type="submit" disabled={busy} className="w-full"><Send size={16} />{busy ? 'Publishing…' : 'Publish to all users'}</Button></form></SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-display text-lg font-bold text-[#003399]">Announcement history</h2><p className="text-xs text-[#003399]/60">Delivery and read totals remain auditable.</p></div><div className="divide-y divide-[#003399]/10">{items.length ? items.map((item) => <article key={item.announcementId} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-bold text-[#003399]">{item.title}</h3><StatusBadge status={item.status} /></div><p className="mt-2 text-sm leading-6 text-[#003399]/70">{item.body}</p></div><span className="rounded-full border border-[#003399]/20 px-2 py-1 text-[10px] font-bold uppercase text-[#003399]">{item.priority}</span></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#003399]/5 p-3 text-xs text-[#003399] sm:grid-cols-4"><span><strong>{item.deliveredCount}</strong><br />Delivered</span><span><strong>{item.readCount}</strong><br />Read</span><span><strong>{format(item.publishAt)}</strong><br />Publish time</span><span><strong>{item.createdBy}</strong><br />Posted by</span></div></article>) : <p className="p-12 text-center font-semibold text-[#003399]">No announcements have been posted.</p>}</div></SectionCard>
    </div>
  </>
}
