import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PrintRequestForm } from './PrintRequestForm'
import { PrintingServiceSetup } from './PrintingServiceSetup'
import { PrintPriceReview } from './PrintPriceReview'
import type { PrintRequest } from './printing-api'

const api=vi.hoisted(()=>({quote:vi.fn(),submit:vi.fn(),setup:vi.fn(),saveSetup:vi.fn(),reviewPrice:vi.fn()}))
vi.mock('./printing-api',()=>({printingApi:api}))
const pricing=[{pricing_rule_id:1,paper_size:'A4',print_type:'Monochrome' as const,price_per_page:2},{pricing_rule_id:2,paper_size:'A4',print_type:'Colored' as const,price_per_page:5}]
const bill={monoPages:1,colorPages:1,images:[],coloredPages:[2],pageCount:2,baseCentavos:700,imageCentavos:0,totalCentavos:700,monoRate:200,colorRate:500,imageFeeMono:0,imageFeeColor:0,settingsVersion:1,mode:'Automatic' as const,copies:1}
const quote={analysis_id:'8b45509a-4364-44bf-9b62-eb03caa05f05',settings_version:1,document_sha256:'hash',printable_file_name:'report.pdf',page_count:2,total_sheets:2,calculated_cost:7,pricing:bill,pages:[],needs_review:false}
const service={accepting_requests:1,unavailable_reason:null,max_document_mb:10}
beforeEach(()=>{vi.resetAllMocks();api.quote.mockResolvedValue(quote);api.submit.mockResolvedValue({});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)

it('reuses the private analysis when copies change and submits only the reviewed artifact reference',async()=>{
 const saved=vi.fn(async()=>{})
 render(<PrintRequestForm service={service} pricing={pricing} onSubmitted={saved}/>)
 fireEvent.change(screen.getByLabelText('Print document'),{target:{files:[new File(['%PDF-file'],'report.pdf',{type:'application/pdf'})]}})
 await waitFor(()=>expect(api.quote).toHaveBeenCalledTimes(1))
 fireEvent.change(screen.getByLabelText('Copies'),{target:{value:'2'}})
 await waitFor(()=>expect(api.quote).toHaveBeenCalledTimes(2))
 expect(api.quote.mock.calls[1][0].get('analysis_id')).toBe(quote.analysis_id)
 expect(api.quote.mock.calls[1][0].get('document')).toBeNull()
 await waitFor(()=>expect(screen.getByRole('button',{name:'Submit print request'}).hasAttribute('disabled')).toBe(false))
 fireEvent.click(screen.getByRole('button',{name:'Submit print request'}))
 await waitFor(()=>expect(api.submit).toHaveBeenCalledTimes(1))
 const body=api.submit.mock.calls[0][0] as FormData
 expect(body.get('document')).toBeNull();expect(body.get('analysis_id')).toBe(quote.analysis_id)
 expect(body.get('quoted_mono_rate')).toBe('200');expect(body.get('settings_version')).toBe('1')
 expect(body.get('request_key')).toMatch(/^[a-f0-9-]{36}$/)
 expect(saved).toHaveBeenCalledOnce()
})
it('takes photocopy originals without an upload and explains staff price confirmation',async()=>{
 api.quote.mockResolvedValue({...quote,analysis_id:null,needs_review:true,preview_url:null,printable_file_name:'Photocopy originals'})
 render(<PrintRequestForm service={service} pricing={pricing} onSubmitted={async()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Photocopy'}))
 expect(screen.queryByLabelText('Print document')).toBeNull()
 fireEvent.change(screen.getByLabelText('Original pages'),{target:{value:'4'}})
 await waitFor(()=>expect(api.quote).toHaveBeenCalled())
 expect(api.quote.mock.calls.at(-1)![0].get('page_count')).toBe('4')
 expect(await screen.findByText(/Staff will verify the pages/)).toBeTruthy()
 expect(screen.getByRole('button',{name:'Submit for page review'})).toBeTruthy()
})
it('schedule settings require review before saving and leave accepted bills unchanged',async()=>{
 const settings={version:1,imageFeeMono:0,imageFeeColor:0,scheduleEnabled:false,weekly:[],exceptions:[],availability:service}
 api.setup.mockResolvedValue(settings);api.saveSetup.mockResolvedValue({...settings,version:2,imageFeeMono:1.5})
 render(<PrintingServiceSetup/>)
 await screen.findByRole('heading',{name:'Photocopy and online printing'})
 expect(screen.getByText(/Both services use the same schedule and image-page additions/)).toBeTruthy()
 expect(screen.getByRole('checkbox',{name:'Use one schedule for photocopy and online printing'})).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Monochrome image page (₱)'),{target:{value:'1.50'}})
 fireEvent.click(screen.getByRole('button',{name:'Review changes'}))
 expect(api.saveSetup).not.toHaveBeenCalled()
 expect(screen.getByText(/New photocopy and online printing requests will use/)).toBeTruthy()
 expect(screen.getByText(/Existing bills stay unchanged/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Confirm and save'}))
 await screen.findByText(/Photocopy and online printing schedule and image-page additions saved/)
 expect(api.saveSetup.mock.calls[0][0].version).toBe(1)
 expect(api.saveSetup.mock.calls[0][0].imageFeeMono).toBe(1.5)
})
it('staff must verify original pages and a review note before sending the final price',async()=>{
 const row={request_id:4,row_version:2,page_count:3,service_kind:'Photocopy',full_name:'QA Borrower'} as PrintRequest
 api.reviewPrice.mockResolvedValue({})
 render(<PrintPriceReview row={row} onClose={()=>{}} onSaved={async()=>{}}/>)
 const button=screen.getByRole('button',{name:'Send final price for confirmation'})
 expect(button.hasAttribute('disabled')).toBe(true)
 fireEvent.change(screen.getByLabelText('Pages containing color'),{target:{value:'2-3'}})
 fireEvent.change(screen.getByLabelText('Review note'),{target:{value:'Checked the originals at the desk'}})
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(button)
 await waitFor(()=>expect(api.reviewPrice).toHaveBeenCalledOnce())
 expect(api.reviewPrice.mock.calls[0][1].color_pages).toEqual([2,3])
})
