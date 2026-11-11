export type VisitInterval = { start: number; end: number | null; purpose: string }

/** Half-open intervals: an exit and an entry at the same instant do not overlap. */
export function concurrentPeak(visits: VisitInterval[], from: number, to: number, now: number, servicePurposes: readonly string[]) {
  const events: Array<[number, number]> = []
  for (const visit of visits) {
    if (servicePurposes.includes(visit.purpose)) continue
    const start = Math.max(from, visit.start), end = Math.min(to, now, visit.end ?? now)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    events.push([start, 1], [end, -1])
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let current = 0, peak = 0, peakAt: number | null = null
  for (const [time, delta] of events) {
    current += delta
    if (current > peak) { peak = current; peakAt = time }
  }
  return { peak, peakAt }
}

export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function nextDate(value: string, days = 1) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function manilaInstant(date: string, time: string) { return new Date(`${date}T${time.slice(0,8)}+08:00`) }
export function localTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  const text = String(value).replace(' ', 'T')
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}+08:00`).getTime()
}
