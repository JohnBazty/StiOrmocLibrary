import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PublicCatalogPage } from './PublicCatalogPage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { enhancedCatalog } from './enhanced-catalog-api'

vi.mock('./enhanced-catalog-api',()=>({enhancedCatalog:{options:vi.fn(),search:vi.fn(),detail:vi.fn()}}))
vi.mock('./CatalogDetailsPanel',()=>({catalogInput:'field',CatalogDetailsPanel:()=> <p>Public book information</p>}))
const book={id:42,title:'Example library book',coverImagePath:'/api/assets/covers/example.jpg',kind:'Book',author:'Author',category:'Science',programs:[],courses:[],files:[],copies:[{id:1,accession:'ACC-1',availability:'Available',condition:'Good',shelf:'Shelf A'}],available:1,copyCount:1}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks()})
it('allows anonymous browsing and details while borrowing leads to login',async()=>{
 vi.mocked(enhancedCatalog.options).mockResolvedValue({categories:[{id:1,name:'Science'}],programs:[],courses:[],types:[],locations:[]} as never)
 vi.mocked(enhancedCatalog.search).mockResolvedValue({items:[book],pagination:{total:1,page:1,limit:24}} as never)
 vi.mocked(enhancedCatalog.detail).mockResolvedValue(book as never)
 render(<MemoryRouter><ThemeProvider><PublicCatalogPage/></ThemeProvider></MemoryRouter>)
 expect(await screen.findByRole('heading',{name:'Example library book'})).toBeTruthy()
 expect(screen.getByRole('img',{name:'Example library book book cover'}).getAttribute('src')).toBe(book.coverImagePath)
 expect(screen.getByRole('link',{name:'Borrow book'}).getAttribute('href')).toBe('/login?catalogTitleId=42')
 fireEvent.click(screen.getByRole('button',{name:'View details'}))
 expect(await screen.findByRole('dialog')).toBeTruthy()
 expect(screen.getAllByRole('img',{name:'Example library book book cover'})).toHaveLength(2)
 expect(screen.getByText('Available · Good')).toBeTruthy()
 expect(screen.getAllByRole('link',{name:'Borrow book'})).toHaveLength(2)
 expect(screen.getAllByRole('link',{name:'Borrow book'}).every(link=>link.getAttribute('href')==='/login?catalogTitleId=42')).toBe(true)
})

it('filters from the main search, preserves other filters and resets pagination when typing or clearing',async()=>{
 vi.mocked(enhancedCatalog.options).mockResolvedValue({categories:[],programs:[],courses:[],types:[],locations:[]} as never)
 vi.mocked(enhancedCatalog.search).mockResolvedValue({items:[book],pagination:{total:1,page:1,limit:24}} as never)
 const scroll=vi.fn()
 const previousScroll=HTMLElement.prototype.scrollIntoView
 HTMLElement.prototype.scrollIntoView=scroll
 try {
  render(<MemoryRouter initialEntries={['/?categoryId=1&page=2#catalog']}><ThemeProvider><PublicCatalogPage/></ThemeProvider></MemoryRouter>)
  await screen.findByRole('heading',{name:book.title})
  await waitFor(()=>expect(scroll).toHaveBeenCalledTimes(1))
  const input=screen.getByRole('textbox',{name:'Search books, authors or ISBN'})
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  fireEvent.change(input,{target:{value:'harry'}})
  await waitFor(()=>expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].get('q')).toBe('harry'))
  expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].get('categoryId')).toBe('1')
  expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].has('page')).toBe(false)
  await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('1 catalog entries'))
  expect(scroll).toHaveBeenCalledTimes(1)
  fireEvent.change(input,{target:{value:''}})
  await waitFor(()=>expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].has('q')).toBe(false))
  expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].get('categoryId')).toBe('1')
  fireEvent.click(screen.getByRole('button',{name:'Search catalog'}))
  expect(scroll).toHaveBeenCalledTimes(2)
  fireEvent.submit(screen.getByRole('search',{name:'Search public library'}))
  expect(scroll).toHaveBeenCalledTimes(3)
 } finally {HTMLElement.prototype.scrollIntoView=previousScroll}
})

it('retains collection search for embedded catalogs without a welcome search',async()=>{
 vi.mocked(enhancedCatalog.options).mockResolvedValue({categories:[],programs:[],courses:[],types:[],locations:[]} as never)
 vi.mocked(enhancedCatalog.search).mockResolvedValue({items:[book],pagination:{total:1,page:1,limit:24}} as never)
 render(<MemoryRouter><ThemeProvider><PublicCatalogPage embedded/></ThemeProvider></MemoryRouter>)
 await screen.findByRole('heading',{name:book.title})
 expect(screen.getAllByRole('textbox')).toHaveLength(1)
 fireEvent.change(screen.getByRole('textbox',{name:'Search title, author or ISBN'}),{target:{value:'978123'}})
 await waitFor(()=>expect(vi.mocked(enhancedCatalog.search).mock.lastCall?.[0].get('q')).toBe('978123'))
})
