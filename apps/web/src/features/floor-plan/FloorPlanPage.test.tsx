import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FloorPlanPage } from './FloorPlanPage'
const api=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('./floor-plan-api',()=>({floorRequest:api.request}))
const layout={areas:[{id:'main',name:'Main Library',width:1200,height:800,background:null}],objects:[{id:'s1',areaId:'main',kind:'shelf',label:'F-A',note:'Near the entrance',shelfId:1,x:80,y:80,width:120,height:80,rotation:0}]}
const data={revision:2,layout,published:layout,shelves:[{id:1,label:'F-A',columnCount:3,rowCount:5,bookCount:1,researchCount:0}],categories:[{id:7,name:'New dynamic category'}],updatedAt:null}
beforeEach(()=>{api.request.mockReset();api.request.mockImplementation(async(path:string)=>{
  if(path.startsWith('/books'))return {items:[{copyId:4,titleId:9,title:'A book',author:'An author',categoryName:'New dynamic category',categoryId:7,shelfId:1,shelfLabel:'F-A',shelfColumn:2,shelfRow:3,shelfColumnCount:3,shelfRowCount:5,barcode:'BOOK-4',callNumber:'005.1 AUT 2026',coverPath:null,availability:'Reserved'}],matches:[{shelfId:1,count:1}],total:1}
  if(path==='/versions')return []
  return structuredClone(data)
})})
afterEach(cleanup)
it('user location links select the assigned copy and use live categories without editor controls',async()=>{
  render(<MemoryRouter initialEntries={['/student/floor-plan?titleId=9&copyId=4']}><FloorPlanPage/></MemoryRouter>)
  expect(await screen.findByRole('option',{name:'New dynamic category'})).toBeTruthy()
  await waitFor(()=>expect(api.request).toHaveBeenCalledWith('/books?titleId=9&copyId=4'))
  expect(await screen.findByRole('heading',{name:'A book'})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Publish'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:/F-A, matching books/i}))
  await waitFor(()=>expect(api.request).toHaveBeenCalledWith('/books?shelfId=1'))
  expect(await screen.findByText('Column 2 · Row 3')).toBeTruthy()
  expect(document.getElementById('shelf-book-4')?.className).toContain('animate-[pulse_1s_ease-in-out_3]')
  expect(screen.getByRole('link',{name:'View details'}).getAttribute('href')).toBe('/student/catalog?titleId=9')
  fireEvent.click(screen.getByRole('button',{name:'Clear filters'}))
  fireEvent.change(screen.getByLabelText('Category'),{target:{value:'7'}})
  await waitFor(()=>expect(api.request).toHaveBeenCalledWith('/books?categoryId=7'))
})
it('admin saves the edited geometry as a draft and explicitly publishes',async()=>{
  render(<MemoryRouter><FloorPlanPage editor/></MemoryRouter>)
  const name=await screen.findByLabelText('Area name')
  fireEvent.change(name,{target:{value:'Expanded Library'}})
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}))
  await waitFor(()=>expect(api.request).toHaveBeenCalledWith('/draft','PUT',expect.objectContaining({revision:2,layout:expect.objectContaining({areas:expect.arrayContaining([expect.objectContaining({name:'Expanded Library'})])})})))
  expect(api.request.mock.calls.some(c=>c[0]==='/publish')).toBe(false)
})
