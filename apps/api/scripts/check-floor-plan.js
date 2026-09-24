// Read-only smoke check against the configured database; no records are modified.
import { db } from '../src/config/db.js'
import { floorPlanRepository } from '../src/modules/floor-plan/floor-plan.repository.ts'

try {
  const state = await floorPlanRepository.state(true)
  const books = await floorPlanRepository.books({})
  const locations = await floorPlanRepository.locations()
  const [[categoryCheck]] = await db.execute(`SELECT COUNT(*) unmanagedCategoryShelves
    FROM categories c LEFT JOIN floor_plan_shelves s ON s.label=c.shelf_location
    WHERE s.id IS NULL`)
  const [[bookCheck]] = await db.execute(`SELECT COUNT(*) mismatchedBookCopies
    FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id JOIN categories c ON c.category_id=t.category_id
    WHERE t.record_type='Book' AND t.lifecycle_status='Active' AND pc.lifecycle_status='Active'
      AND NOT (pc.shelf_location <=> c.shelf_location)`)
  const [[researchCheck]] = await db.execute(`SELECT COUNT(*) mismatchedResearchCopies
    FROM research_inventory ri JOIN titles t ON t.title_id=ri.title_id JOIN categories c ON c.category_id=t.category_id
    WHERE t.record_type='Research/Thesis' AND t.lifecycle_status='Active' AND ri.lifecycle_status='Active'
      AND NOT (ri.shelf_location <=> c.shelf_location)`)
  console.log(JSON.stringify({
    revision: state.revision,
    published: !!state.published,
    areas: state.layout?.areas.length,
    shelves: state.shelves.length,
    categories: state.categories.length,
    activeBookCopies: books.total,
    locations: locations.length,
    unmanagedCategoryShelves: Number(categoryCheck.unmanagedCategoryShelves),
    mismatchedBookCopies: Number(bookCheck.mismatchedBookCopies),
    mismatchedResearchCopies: Number(researchCheck.mismatchedResearchCopies),
  }))
} finally {
  await db.end()
}
