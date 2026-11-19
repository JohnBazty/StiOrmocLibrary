import { useState } from 'react'

const dayLabel = (day: string) => new Date(`${day}T12:00:00+08:00`).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })

export function ClearanceDayPicker({ days, onChange }: { days: string[]; onChange: (days: string[]) => void }) {
  const [month, setMonth] = useState(() => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7))
  const [year, monthNumber] = month.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  function toggle(day: string) { onChange(days.includes(day) ? days.filter(value => value !== day) : [...days, day].sort()) }
  return <div className="sm:col-span-3">
    <p id="clearance-days-help" className="mb-3 text-sm opacity-75">Choose each day on the calendar. Select a day again to remove it. The same hours apply to every selected day.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="max-w-sm rounded-xl border p-3">
        <label className="text-sm font-semibold">Calendar month<input type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value) }} className="mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3" /></label>
        <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label="Choose clearance days" aria-describedby="clearance-days-help">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day} className="text-center text-xs opacity-70">{day}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: count }, (_, index) => {
            const day = `${month}-${String(index + 1).padStart(2, '0')}`
            const selected = days.includes(day)
            return <button key={day} type="button" aria-label={dayLabel(day)} aria-pressed={selected} onClick={() => toggle(day)} className={`min-h-11 rounded-lg border text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-transparent hover:border-current'}`}>{index + 1}</button>
          })}
        </div>
      </div>
      <div><p role="status" className="text-sm font-semibold">{days.length} {days.length === 1 ? 'day' : 'days'} selected</p>{days.length ? <ul className="mt-2 flex flex-wrap gap-2">{days.map(day => <li key={day}><button type="button" onClick={() => toggle(day)} aria-label={`Remove ${dayLabel(day)}`} className="min-h-11 rounded-xl border px-3 text-sm">{dayLabel(day)} ×</button></li>)}</ul> : <p className="mt-2 text-sm opacity-70">No days selected yet.</p>}</div>
    </div>
  </div>
}
