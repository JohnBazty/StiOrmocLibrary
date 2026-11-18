import { Router,type Request,type Response,type NextFunction } from 'express'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { historicalPrintingService } from '../printing/historical-print.service.ts'
import { supplyDetailsService } from '../printing/supply-details.service.ts'
import { stockItemsService } from './stock-items.service.ts'
import { choice,type ItemKind } from './maintenance-validation.ts'
import { createIntegrityProtectedCsvStream } from '../reports/csv-integrity.ts'
import { HttpError } from '../../core/http-error.ts'

type Handler=(r:Request,s:Response)=>Promise<unknown>
const run=(fn:Handler)=>(r:Request,s:Response,n:NextFunction)=>{void fn(r,s).then(data=>s.set('Cache-Control','private, no-store').json({success:true,data})).catch(n)}
const actor=(s:Response)=>Number(s.locals.authenticatedUser.accountId)
const kind=(r:Request):ItemKind=>choice(r.params.kind,['printing','merchandise'],'an item list')
export function createMaintenanceRouter(history=historicalPrintingService,supplies=supplyDetailsService,items=stockItemsService){
  const router=Router();router.use(requireLibraryPermission('library.manage'))
  router.get('/printing/history',run((r,s)=>history.list(actor(s),r.query)))
  router.post('/printing/history/preview',run((r,s)=>history.preview(actor(s),r.body)))
  router.post('/printing/history',run((r,s)=>history.save(actor(s),r.body)))
  router.put('/printing/history/:id',run((r,s)=>history.save(actor(s),r.body,r.params.id)))
  router.post('/printing/history/:id/void',run((r,s)=>history.void(actor(s),r.params.id,r.body)))
  router.get('/printing/history/:id/events',run((r,s)=>history.history(actor(s),r.params.id)))
  router.get('/printing/supply-details',run((_r,s)=>supplies.list(actor(s))))
  router.put('/printing/supply-details/:kind/:id',run((r,s)=>supplies.save(actor(s),r.params.kind,r.params.id,r.body)))
  router.get('/printing/supply-details/:id/events',run((r,s)=>supplies.history(actor(s),r.params.id)))
  router.get('/stock/:kind',run((r,s)=>items.list(actor(s),kind(r),String(r.query.q??''))))
  router.post('/stock/:kind/categories',run((r,s)=>items.category(actor(s),kind(r),r.body)))
  router.put('/stock/:kind/categories/:id',run((r,s)=>items.category(actor(s),kind(r),r.body,r.params.id)))
  router.post('/stock/:kind/items',run((r,s)=>items.save(actor(s),kind(r),r.body)))
  router.put('/stock/:kind/items/:id',run((r,s)=>items.save(actor(s),kind(r),r.body,r.params.id)))
  router.post('/stock/:kind/items/:id/movements',run((r,s)=>items.movement(actor(s),kind(r),r.params.id,r.body)))
  router.get('/stock/:kind/items/:id/history',run((r,s)=>items.history(actor(s),kind(r),r.params.id)))
  router.get('/stock/:kind/report.csv',async(r,s,n)=>{try{
    const selectedKind=kind(r),data=await items.list(actor(s),selectedKind,String(r.query.q??''))
    if(data.items.length>=1000)throw new HttpError(422,'STOCK_EXPORT_LIMIT','Narrow the item search before exporting 1,000 or more records.')
    const cell=(v:unknown)=>{let value=String(v??'');if(/^\s*[=+\-@]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"'}
    async function* rows(){yield '\uFEFF'+['Item','Category','Specifications','Unit','Price (PHP)','Current stock','Low-stock threshold','State'].map(cell).join(',')+'\r\n';for(const i of data.items)yield [i.name,i.category,i.specifications,i.unit,i.price,i.balance,i.threshold,i.state].map(cell).join(',')+'\r\n'}
    s.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${selectedKind}-current-stock.csv"`,'Cache-Control':'private, no-store'});createIntegrityProtectedCsvStream(rows(),`${selectedKind}_stock`,8).on('error',e=>s.destroy(e)).pipe(s)
  }catch(e){n(e)}})
  return router
}
export const maintenanceRouter=createMaintenanceRouter()
