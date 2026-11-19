import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {ImportDuplicateComparison} from './ImportDuplicateComparison'
import type {ImportRow} from './enhanced-catalog-api'
afterEach(cleanup)
const row=(id:number,title:string,copies:string)=>({id,sheet:'SHS BOOKS',sourceRow:id===1?21:45,overlaps:id===1?[2]:[1],data:{title,author:'Synthetic author',isbn:'9780132350884',copies}} as ImportRow)
it('explains conflicting titles sharing one ISBN and shows both source entries without choosing copy quantities',()=>{
 const first=row(1,'First title','5'),second=row(2,'Different title','6');render(<ImportDuplicateComparison row={first} rows={[first,second]}/>)
 expect(screen.getByText(/same ISBN is used for different book titles/)).toBeTruthy();expect(screen.getByText('First title')).toBeTruthy();expect(screen.getByText('Different title')).toBeTruthy();expect(screen.getByText('SHS BOOKS, line 45')).toBeTruthy();expect(screen.getByText('6')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull()
})
it('uses repeat-entry wording for matching title and author and keeps the quantities separate',()=>{
 const first=row(1,'Same title','5'),second=row(2,'Same title','6');render(<ImportDuplicateComparison row={second} rows={[first,second]}/>);expect(screen.getByText(/may be extra copies or the same copies listed again/)).toBeTruthy();expect(screen.getByText('5')).toBeTruthy();expect(screen.getByText('6')).toBeTruthy()
})
