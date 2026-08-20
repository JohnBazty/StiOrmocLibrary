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
