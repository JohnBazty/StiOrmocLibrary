import { assertShelfCapacity } from './shelf-capacity.service.ts'
import type { HoldingsData } from './holdings-parser.ts'

type Query = Parameters<typeof assertShelfCapacity>[0]
type CategoryShelf = { shelfLocation: string | null; shelfColumn: number; shelfRow: number }

/**
 * Where imported copies go. A row with no shelf is imported as Unassigned (shelf_location NULL)
 * without a capacity check; a librarian places it later from shelf suggestions.
 */
export async function importCopyPlacement(c: Query, data: HoldingsData, category: CategoryShelf | null, copies: number) {
  if (!String(data.location ?? '').trim()) return { shelfLocation: null as string | null, shelfColumn: 1, shelfRow: 1 }
  const sameShelf = category?.shelfLocation === data.location
  return assertShelfCapacity(c, {
    locationId: data.locationId, shelfLocation: data.location,
    shelfColumn: data.shelfColumn ?? (sameShelf ? category!.shelfColumn : 1),
    shelfRow: data.shelfRow ?? (sameShelf ? category!.shelfRow : 1),
  }, copies) as Promise<{ shelfLocation: string | null; shelfColumn: number; shelfRow: number }>
}
