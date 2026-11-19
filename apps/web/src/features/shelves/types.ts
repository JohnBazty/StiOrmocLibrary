export type Compartment = {
  column: number
  row: number
  capacity: number | null
  used: number
  remaining: number | null
  status: 'Not configured' | 'Available' | 'Nearly full' | 'Full' | 'Over capacity'
}
export type ManagedShelf = {
  id: number
  label: string
  columnCount: number
  rowCount: number
  defaultCapacity: number | null
  capacityConfigured: boolean
  version: number
  status: 'Active' | 'Archived'
  used: number
  capacity: number | null
  remaining: number | null
  compartments: Compartment[]
}
export type ShelfPayload = {
  label: string
  columnCount: number
  rowCount: number
  defaultCapacity: number
  overrides: Array<{ column: number; row: number; capacity: number }>
  version?: number
  status: 'Active' | 'Archived'
}
export type PlacementValue = { locationId?: number; shelfLocation: string; shelfColumn: number; shelfRow: number }

export function managedShelfFromOption(item: { id: number; name: string; status: string; version: number; columnCount?: number; rowCount?: number; defaultCapacity?: number | null; capacityConfigured?: boolean; used?: number; capacity?: number | null; remaining?: number | null; compartments?: Compartment[] }): ManagedShelf {
  return { id: Number(item.id), label: item.name, status: item.status === 'Archived' ? 'Archived' : 'Active', version: item.version, columnCount: item.columnCount ?? 1, rowCount: item.rowCount ?? 1, defaultCapacity: item.defaultCapacity ?? null, capacityConfigured: item.capacityConfigured ?? false, used: item.used ?? 0, capacity: item.capacity ?? null, remaining: item.remaining ?? null, compartments: item.compartments ?? [] }
}
