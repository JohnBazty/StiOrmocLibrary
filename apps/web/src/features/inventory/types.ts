export type InventorySummary = {
  total_catalog_materials: number
  total_physical_copies: number
  damaged_copies_count: number
  lost_copies_count: number
}

export type InventoryCopy = {
  physical_copy_id: number
  title_id: number
  item_title: string
  authors: string[]
  category_name: string | null
  accession_number: string
  barcode: string
  shelf_location: string
  shelf_column: number
  shelf_row: number
  call_number: string | null
  condition_status: string
  availability_status: string
  last_verified_at: string | null
  row_version: number
}

export type InventoryPagination = {
  page: number
  limit: number
  total: number
  total_pages: number
}

export type InventoryFilters = {
  page: number
  limit: number
  query: string
  conditionState: string
  availabilityStatus: string
}

export type ThesisInventorySummary = {
  total_thesis_materials: number
  damaged_thesis_count: number
  lost_thesis_count: number
}

export type ThesisInventoryFilters = {
  page: number
  limit: number
  query: string
  conditionState: string
  availabilityStatus: string
  publicationYear: string
}

export type ThesisInventoryRow = {
  research_inventory_id: number
  item_title: string
  title: string
  authors: string
  adviser: string
  publication_year: number
  accession_number: string
  barcode: string
  condition_state: 'good' | 'fair' | 'for_repair' | 'damaged' | 'lost'
  availability_status: 'available' | 'unavailable' | 'borrowed' | 'reserved'
  shelf_location: string
  last_audited_at: string | null
  row_version: number
}

export type InventoryRemovalTarget = {
  kind: 'book' | 'thesis'
  id: number
  item_title: string
  accession_number: string
  barcode: string
}

export type StocktakeSession = {
  stocktake_session_id: number
  session_name: string
  scope_kind: string
  scope_id: string | null
  scope_label: string
  asset_kind: string
  status: string
  started_at: string
  started_by_label: string
  closed_at: string | null
  reviewed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  row_version: number
  expected_count: number
  present_count: number
  missing_count: number
  exception_count: number
  open_discrepancy_count: number
}

export type StocktakeScopeOptions = {
  shelves: Array<{ id: number; label: string; columnCount: number; rowCount: number }>
  categories: Array<{ id: number; name: string; shelf_location: string | null }>
  rooms: Array<{ id: string; name: string }>
  map_revision: number
}

export type StocktakeDiscrepancy = {
  stocktake_discrepancy_id: number
  finding_key: string
  finding_code: string
  status: string
  row_version: number
  asset_kind: string | null
  barcode: string | null
  accession_number: string | null
  title: string | null
  home_shelf_label: string | null
  created_at: string
}

export type StocktakeScanResult = {
  stocktake_scan_id: number
  duplicate_request: boolean
  classification: string
  classifications?: string[]
  entered_barcode: string
  resolved_asset_kind?: string | null
  title?: string | null
  observed_shelf_label?: string
}
