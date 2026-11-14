import { afterEach, expect, it, vi } from 'vitest'
import { fetchResearchCatalog } from './research-catalog-api'

afterEach(()=>vi.unstubAllGlobals())
it('sends research filters to the server with pagination and the existing request signal',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:[],meta:{pagination:{page:2,limit:25,total:0,totalPages:0}}})})
 vi.stubGlobal('fetch',fetcher)
 const controller=new AbortController()
 await fetchResearchCatalog({query:'Campus',author:'Example',adviser:'Guide',department:'IT',publicationYear:2026,page:2,signal:controller.signal})
 const query=new URL(fetcher.mock.calls[0][0],'http://localhost').searchParams
 expect(Object.fromEntries(query)).toEqual({q:'Campus',author:'Example',adviser:'Guide',department:'IT',publication_year:'2026',page:'2',limit:'25'})
 expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal)
})
