/**
 * Clock times for library rules. People enter and read 12-hour times ("8:00 AM"); storage and
 * comparisons use a plain 24-hour "HH:MM" value that never reaches the screen.
 */
export const CLOCK_TIME_HINT = 'a time such as 8:00 AM or 5:30 PM'

/** "8:00 AM", "8:00am", "08:00" or "17:30:00" -> "HH:MM"; null for blank; undefined when not a time. */
export function parseClockTime(value: unknown): string | null | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const twelve = /^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/.exec(text)
  if (twelve) {
    const hour = Number(twelve[1]), minute = Number(twelve[2])
    if (hour < 1 || hour > 12 || minute > 59) return undefined
    const hours24 = (hour % 12) + (/[Pp]/.test(twelve[3]) ? 12 : 0)
    return `${String(hours24).padStart(2, '0')}:${twelve[2]}`
  }
  const plain = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(text)
  if (plain && Number(plain[1]) <= 23 && Number(plain[2]) <= 59) return `${plain[1]}:${plain[2]}`
  return undefined
}

/** "17:30" -> "5:30 PM". */
export function formatClockTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
