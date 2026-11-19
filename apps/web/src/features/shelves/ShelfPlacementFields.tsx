import { Link } from 'react-router-dom'
import type { ManagedShelf, PlacementValue } from './types'

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200'

export function selectedCompartment(shelves: ManagedShelf[], value: PlacementValue) {
  const shelf = shelves.find((item) => item.label === value.shelfLocation && item.status !== 'Archived')
  return shelf?.compartments?.find((cell) => cell.column === value.shelfColumn && cell.row === value.shelfRow)
}

export function placementFits(shelves: ManagedShelf[], value: PlacementValue, quantity: number) {
  const cell = selectedCompartment(shelves, value)
  return Boolean(
    Number.isInteger(quantity) &&
      quantity > 0 &&
      cell &&
      cell.capacity !== null &&
      cell.remaining !== null &&
      cell.remaining >= quantity,
  )
}

export function ShelfPlacementFields({
  shelves,
  value,
  onChange,
  quantity = 1,
  disabled = false,
  label = 'Shelf location',
  name = 'shelfLocation',
  loading = false,
  error = '',
  credits = [],
}: {
  shelves: ManagedShelf[]
  value: PlacementValue
  onChange: (value: PlacementValue) => void
  quantity?: number
  disabled?: boolean
  label?: string
  name?: string
  loading?: boolean
  error?: string
  credits?: Array<{ shelfLocation: string; shelfColumn: number; shelfRow: number }>
}) {
  const shelf = shelves.find((item) => item.label === value.shelfLocation && item.status !== 'Archived')
  const cell = selectedCompartment(shelves, value)
  const credit = credits.filter(
    (item) =>
      item.shelfLocation === value.shelfLocation &&
      item.shelfColumn === value.shelfColumn &&
      item.shelfRow === value.shelfRow,
  ).length
  const remaining = cell?.remaining === null || cell?.remaining === undefined ? null : cell.remaining + credit

  return (
    <fieldset disabled={disabled || loading} className="space-y-3 sm:col-span-2" aria-label="Copy placement">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${labelClass} ${shelf ? 'sm:col-span-1' : 'sm:col-span-3'}`}>
          {label} *
          <select
            name={name}
            required
            value={value.shelfLocation}
            className={inputClass}
            onChange={(event) => {
              const next = shelves.find((item) => item.label === event.target.value)
              const firstFitting = next?.compartments?.find(
                (c) => c.remaining !== null && c.remaining >= quantity,
              )
              onChange({
                shelfLocation: event.target.value,
                locationId: next?.id,
                shelfColumn: firstFitting?.column ?? 1,
                shelfRow: firstFitting?.row ?? 1,
              })
            }}
          >
            <option value="">{loading ? 'Loading shelves…' : 'Choose managed shelf'}</option>
            {shelves
              .filter((item) => item.status !== 'Archived')
              .map((item) => (
                <option key={item.id} value={item.label}>
                  {item.label}
                  {item.capacityConfigured ? ` (${item.remaining ?? 0} spaces free)` : ' — Capacity not configured'}
                </option>
              ))}
          </select>
        </label>
        <input type="hidden" name="locationId" value={shelf?.id ?? ''} />
        {shelf ? (
          <>
            <label className={labelClass}>
              Column
              <select
                name="shelfColumn"
                value={value.shelfColumn}
                className={inputClass}
                onChange={(event) =>
                  onChange({ ...value, locationId: shelf.id, shelfColumn: Number(event.target.value) })
                }
              >
                {Array.from({ length: shelf.columnCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Column {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Row
              <select
                name="shelfRow"
                value={value.shelfRow}
                className={inputClass}
                onChange={(event) =>
                  onChange({ ...value, locationId: shelf.id, shelfRow: Number(event.target.value) })
                }
              >
                {Array.from({ length: shelf.rowCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Row {index + 1}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {shelf && !shelf.capacityConfigured ? (
        <Link
          to={`/librarian/maintenance?tab=locations&editShelf=${shelf.id}`}
          className="block rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950 underline dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Capacity not configured for {shelf.label}. Click here to set up this shelf in Library setup → Shelves &amp; locations, or choose another shelf above.
        </Link>
      ) : null}

      {cell && remaining !== null ? (
        <p
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
            remaining < quantity
              ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
              : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200'
          }`}
        >
          {remaining < quantity
            ? `Only ${Math.max(0, remaining)} spaces remain in ${shelf?.label} (Column ${value.shelfColumn}, Row ${value.shelfRow}); you are placing ${quantity} copies. Choose another compartment below or reduce the copy count.`
            : `Shelf space ready: ${cell.used} used · ${remaining} spaces remaining · ${cell.capacity} capacity · ${cell.status}`}
        </p>
      ) : null}

      {shelf?.capacityConfigured && shelf.compartments?.length ? (
        <details className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs dark:border-slate-700/60 dark:bg-slate-900">
          <summary className="cursor-pointer font-bold text-[#0b5ea2] dark:text-sky-300">
            Browse available compartments on {shelf.label}
          </summary>
          <div className="mt-3 max-w-full overflow-x-auto">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${shelf.columnCount}, minmax(145px, 1fr))`,
                minWidth: `${shelf.columnCount * 150}px`,
              }}
            >
              {shelf.compartments.map((item) => (
                <button
                  type="button"
                  key={`${item.column}-${item.row}`}
                  disabled={item.remaining === null || item.remaining < quantity}
                  aria-pressed={item.column === value.shelfColumn && item.row === value.shelfRow}
                  className="min-h-11 rounded-lg border border-slate-200 p-2 text-left transition hover:border-[#0b5ea2] aria-pressed:border-[#0b5ea2] aria-pressed:bg-[#0b5ea2]/10 disabled:opacity-45 dark:border-slate-700"
                  onClick={() =>
                    onChange({
                      shelfLocation: shelf.label,
                      locationId: shelf.id,
                      shelfColumn: item.column,
                      shelfRow: item.row,
                    })
                  }
                >
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Column {item.column}, Row {item.row}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                    {item.remaining ?? '?'} remaining · {item.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </fieldset>
  )
}
