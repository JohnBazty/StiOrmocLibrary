# Fair fine rates

- Date created: 2026-11-18
- Date last updated: 2026-11-18
- Status: built

## Why
The overdue fine calculator (`calculateOperatingFine` in `apps/api/src/modules/fines/fine-calculator.ts`) has three results that are hard to explain to a student:
1. **The due date can cost more than the next day.** Hours are counted on clock time with no limit. A book due at 8:59 AM and returned at 5:00 PM is 9 started hours, so PHP 18; returned the next morning it is 1 library day, so PHP 10.
2. **The evening balance climbs, then drops.** The overdue job recalculates every minute, so after closing the shown fine keeps rising (PHP 30 by 11:59 PM), then falls to PHP 10 at midnight when the daily rate takes over.
3. **The balance can show PHP 0.** A book due on a Saturday shows PHP 0 all Sunday (no library day has passed yet), then PHP 10 on Monday.

This is step 1 of the fine enforcement order in `docs/roadmap.md` section 4.

## How
Only the calculator changes. Rates, the cap and the stored fine columns stay the same.

1. **Due-date hours stop at closing.** On the due date, count started hours from the due time to the earlier of the return (or now) and that day's `closes_at` from `library_operating_schedule`. If the day has no `closes_at`, use 17:00 (the standing closing time).
2. **The due date costs at most one day.** The due-date amount is `min(hours × hourly rate, daily rate)`.
3. **The fine never drops.** From the day after the due date, the fine is `max(library days × daily rate, due-date amount)`. A closed day right after the due date therefore keeps the due-date amount instead of showing PHP 0, and midnight never lowers the fine.
4. The PHP 500 cap still applies last.

```ts
const dueDayAmount = Math.min(hoursUntil(Math.min(evaluatedAt, closingOn(dueDate))) * policy.hourlyRate, policy.dailyRate)
if (sameDay) return capped(dueDayAmount, 'Hourly')
return capped(Math.max(libraryDays * policy.dailyRate, dueDayAmount), libraryDays ? 'Daily' : 'Hourly')
```

`loadFineContext` already reads `library_operating_schedule`; it also reads `closes_at` per weekday and passes it in the calendar.

### Worked examples (PHP 2 per hour, PHP 10 per day, due 8:59 AM)
| Returned | Today | After the fix |
| --- | --- | --- |
| Same day 10:01 AM | 4 | 4 |
| Same day 5:00 PM | 18 | 10 |
| Due-date evening (shown, still out) | up to 30 | 10 |
| Due Saturday, shown on Sunday | 0 | 10 |
| Due Saturday, returned Monday | 10 | 10 |
| Two library days later | 20 | 20 |

### Existing fines
- Paid, waived, voided and finalised fines do not change.
- Accruing fines are recalculated by the overdue job within a minute. With the same rates, a fine can only go down, or stay the same, at return time. The one shown increase is the closed-day case (PHP 0 → PHP 10), which the student would owe anyway on the next open day.

## Tests (written first)
`fine-calculator.test.ts`: the six worked examples above, a day with no `closes_at` (falls back to 17:00), a custom closing time, a return exactly at closing, and the cap still applying. The overdue job and return tests keep passing.

## Implementation tracking
- [x] Ethan approves this plan (2026-11-18)
- [ ] Branch `fix/fair-fine-rates` from `feat/fines-maintenance` (it changes the same calculator), or from `main` once fines maintenance merges
- [x] Failing calculator tests, then the calculator change and `closes_at` in `loadFineContext`
- [x] `npm run typecheck`, `npm test`, `npm run build` (488 API, 318 web tests pass)
- [x] `security-reviewer`; fix CRITICAL to MEDIUM (no CRITICAL/HIGH; fixed: a due date that reaches the daily rate is stored as 1 Daily unit so units × rate = amount; bad `closes_at` falls back to 17:00. Accepted: a loan due after closing has a PHP 0 fine that day, which blocks nothing since clearance and borrowing filter `fine_amount > 0`)
- [x] Update the "Current overdue fine" text on the Fine rules page if needed
- [ ] Commit; ask Ethan before push or draft PR

## Database boundary
`040_library_hours_8am_5pm.sql` sets open days to 08:00–17:00 (a data fix; the calculator needs no migration). `library_operating_schedule.closes_at` already exists. No live writes.

## Change log
- 2026-11-18: Approved and built (calculator, `closes_at` in `loadFineContext`, Fine rules page note). Ethan confirmed library hours are 08:00 to 17:00; migration `040_library_hours_8am_5pm.sql` replaces the 19:00 closing from `022` (applied live 2026-11-18).
- 2026-11-18: Plan drafted from the fine calculator review in the fines maintenance session.
