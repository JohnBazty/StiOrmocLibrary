import {cleanup,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import {CatalogMaintenancePage} from './CatalogMaintenancePage'
vi.mock('./enhanced-catalog-api',()=>({enhancedCatalog:{options:vi.fn(async()=>({types:[],locations:[],programs:[],courses:[],categories:[]}))}}))
vi.mock('../payments/payments-api',()=>({paymentRequest:vi.fn(async()=>({enabled:true,version:1}))}))
vi.mock('../shelves/ShelfManagement',()=>({ShelfManagementPage:()=> <p>Shelf settings remain available</p>}))
vi.mock('./CatalogManagementPage',()=>({CatalogManagementPage:()=> <p>Catalog remains available</p>}))
afterEach(()=>{cleanup();window.history.replaceState({},'', '/')})
it.each(['payments','types','dewey'])('does not open the removed %s setup page from an old link',async(section)=>{
 window.history.replaceState({},'', `/librarian/maintenance?section=${section}`)
 render(<MemoryRouter><CatalogMaintenancePage/></MemoryRouter>)
 const navigation=screen.getByRole('navigation',{name:'Library setup sections'})
 expect(within(navigation).queryByRole('button',{name:'Payments'})).toBeNull();expect(within(navigation).queryByRole('button',{name:'Resource types'})).toBeNull();expect(within(navigation).queryByRole('button',{name:'Dewey classifications'})).toBeNull()
 expect(within(navigation).queryByRole('button',{name:'Archived screens'})).toBeNull();expect(screen.getByText('Shelf settings remain available')).toBeTruthy();expect(screen.queryByRole('checkbox')).toBeNull()
})
