import type { ManagedShelf, PlacementValue } from './types'

const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 py-2 text-sm text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white'
export function selectedCompartment(shelves: ManagedShelf[], value: PlacementValue) {
  const shelf = shelves.find(item => item.label === value.shelfLocation && item.status !== 'Archived')
  return shelf?.compartments?.find(cell => cell.column === value.shelfColumn && cell.row === value.shelfRow)
}
export function placementFits(shelves: ManagedShelf[], value: PlacementValue, quantity: number) {
  const cell = selectedCompartment(shelves, value)
  return Boolean(Number.isInteger(quantity) && quantity > 0 && cell && cell.capacity !== null && cell.remaining !== null && cell.remaining >= quantity)
}
export function ShelfPlacementFields({ shelves, value, onChange, quantity = 1, disabled = false, label = 'Shelf location', name = 'shelfLocation', loading = false, error = '', credits = [] }: {
  shelves: ManagedShelf[]; value: PlacementValue; onChange: (value: PlacementValue) => void
  quantity?: number; disabled?: boolean; label?: string; name?: string; loading?: boolean; error?: string
  credits?: Array<{ shelfLocation: string; shelfColumn: number; shelfRow: number }>
}) {
  const shelf = shelves.find(item => item.label === value.shelfLocation && item.status !== 'Archived')
  const cell = selectedCompartment(shelves, value)
  const credit = credits.filter(item => item.shelfLocation === value.shelfLocation && item.shelfColumn === value.shelfColumn && item.shelfRow === value.shelfRow).length
  const remaining = cell?.remaining === null || cell?.remaining === undefined ? null : cell.remaining + credit
  return <fieldset disabled={disabled || loading} className="space-y-3 sm:col-span-2" aria-label="Copy placement">
    <label className="block text-sm font-semibold">{label} *<select name={name} required value={value.shelfLocation} className={inputClass} onChange={event => {
      const next = shelves.find(item => item.label === event.target.value)
      onChange({ shelfLocation: event.target.value, locationId: next?.id, shelfColumn: 1, shelfRow: 1 })
    }}><option value="">{loading ? 'Loading shelves…' : 'Choose managed shelf'}</option>{shelves.filter(item => item.status !== 'Archived').map(item => <option key={item.id} value={item.label}>{item.label}{item.capacityConfigured ? '' : ' — Capacity not configured'}</option>)}</select></label>
    <input type="hidden" name="locationId" value={shelf?.id ?? ''}/>
    {shelf ? <div className="grid grid-cols-2 gap-3"><label className="text-sm">Column<select name="shelfColumn" value={value.shelfColumn} className={inputClass} onChange={event => onChange({ ...value, locationId: shelf.id, shelfColumn: Number(event.target.value) })}>{Array.from({ length: shelf.columnCount }, (_, index) => <option key={index + 1} value={index + 1}>Column {index + 1}</option>)}</select></label><label className="text-sm">Row<select name="shelfRow" value={value.shelfRow} className={inputClass} onChange={event => onChange({ ...value, locationId: shelf.id, shelfRow: Number(event.target.value) })}>{Array.from({ length: shelf.rowCount }, (_, index) => <option key={index + 1} value={index + 1}>Row {index + 1}</option>)}</select></label></div> : null}
    {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    {shelf && !shelf.capacityConfigured ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Capacity not configured. Set up this shelf in Maintenance → Locations before adding copies.</p> : null}
    {cell && remaining !== null ? <p className={`rounded-xl p-3 text-sm ${remaining < quantity ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100' : 'bg-[#0b5ea2]/5 dark:bg-white/5'}`}>{remaining < quantity ? `Only ${Math.max(0, remaining)} spaces remain; you are placing ${quantity} copies. Choose another compartment or reduce the quantity.` : `${cell.used} used · ${remaining} spaces remaining · ${cell.capacity} capacity · ${cell.status}`}</p> : null}
    {shelf?.capacityConfigured && shelf.compartments?.length ? <details className="rounded-xl border border-[#0b5ea2]/15 p-3 text-sm dark:border-white/15"><summary className="cursor-pointer font-semibold">Available compartments on {shelf.label}</summary><div className="mt-3 max-w-full overflow-x-auto"><div className="grid gap-2" style={{gridTemplateColumns:`repeat(${shelf.columnCount}, minmax(150px, 1fr))`,minWidth:`${shelf.columnCount * 160}px`}}>{shelf.compartments.map(item => <button type="button" key={`${item.column}-${item.row}`} disabled={item.remaining === null || item.remaining < quantity} aria-pressed={item.column === value.shelfColumn && item.row === value.shelfRow} className="min-h-11 rounded-lg border border-[#0b5ea2]/20 p-2 text-left aria-pressed:bg-[#0b5ea2]/10 disabled:opacity-50 dark:border-white/20" onClick={() => onChange({ shelfLocation: shelf.label, locationId: shelf.id, shelfColumn: item.column, shelfRow: item.row })}>Column {item.column}, Row {item.row}<span className="block text-xs">{item.remaining ?? '?'} remaining · {item.status}</span></button>)}</div></div></details> : null}
  </fieldset>
}
