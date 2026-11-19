import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { CatalogMaintenancePage } from './CatalogMaintenancePage'
vi.mock('./CatalogManagementPage',()=>({CatalogManagementPage:()=> <p>Canonical title catalog</p>}))
vi.mock('../shelves/ShelfManagement',()=>({ShelfManagementPage:()=> <h2>Managed shelves</h2>}))
vi.mock('./CatalogDetailsPanel',()=>({CatalogDetailsPanel:()=> <p>Title detail editor</p>,catalogInput:''}))
vi.mock('./enhanced-catalog-api',()=>({enhancedCatalog:{search:vi.fn(async()=>({items:[]})),options:vi.fn(async()=>({locations:[],programs:[],courses:[],types:[],categories:[]}))}}))
function Navigation(){const navigate=useNavigate();const location=useLocation();return <><button onClick={()=>navigate(-1)}>Browser back</button><span data-testid="location">{location.search}</span></>}
afterEach(cleanup)
it('opens configuration by default and links to the canonical catalog',()=>{
 render(<MemoryRouter initialEntries={['/librarian/maintenance']}><CatalogMaintenancePage/></MemoryRouter>)
 expect(screen.getByRole('heading',{name:'Managed shelves'})).toBeTruthy()
 expect(screen.getByRole('link',{name:'Open catalog'}).getAttribute('href')).toBe('/librarian/catalog')
 expect(screen.queryByText('Canonical title catalog')).toBeNull()
})
it('keeps URL, panel and browser history together for legacy catalog links',async()=>{
 render(<MemoryRouter initialEntries={['/librarian/maintenance?tab=details']}><Navigation/><CatalogMaintenancePage/></MemoryRouter>)
 expect(screen.getByLabelText('Find a title')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Books & research'}))
 await waitFor(()=>expect(screen.getByText('Canonical title catalog')).toBeTruthy())
 expect(screen.queryByLabelText('Find a title')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Browser back'}))
 await waitFor(()=>expect(screen.getByLabelText('Find a title')).toBeTruthy())
})
