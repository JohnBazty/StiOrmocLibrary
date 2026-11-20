import { randomUUID } from 'node:crypto'
import { db, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { PrintingRepository } from './printing.repository.ts'
import { inspectPrintDocument } from './printing.document.ts'
import { analyzePrintPages } from './printing-page-analysis.ts'
import { storePrintDocument, resolvePrintDocument, removePrintDocument } from './printing.storage.ts'
import { lockPaperPrice } from './paper-pricing.ts'
import { amountCents, outputMode, pageNumbers, parseSetup, pricePages, printingWindow, whole, type PageFinding, type PrintSetup } from './printing-phase-one.rules.ts'

type Actor={accountId?:number;schoolId?:string;role?:string}
type Reader=Pick<PoolConnection,'execute'>
const problem=(message:string,status=422)=>new HttpError(status,'PRINT_REVIEW_REQUIRED',message)
function uuid(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw problem('The request reference is invalid. Refresh and try again.');return value}
function findings(value:any):PageFinding[]{return value?.pages??value??[]}
const dimensions:Record<string,[number,number]>={A4:[210,297],A3:[297,420],'A3+':[329,483],A2:[420,594],B4:[257,364],B3:[364,515],Letter:[215.9,279.4],Short:[215.9,279.4],Legal:[215.9,355.6],Long:[215.9,330.2]}

function samePaper(a:Record<string,unknown>|undefined,b:ReturnType<typeof paperSpec>){return Boolean(a&&a.name===b.name&&Number(a.widthMm??0)===Number(b.widthMm??0)&&Number(a.heightMm??0)===Number(b.heightMm??0))}
function paperSpec(rule:Record<string,unknown>,paper:string){const factor=rule.dimension_unit==='in'?25.4:rule.dimension_unit==='cm'?10:1,fallback=dimensions[paper];return {name:paper,widthMm:rule.width?Number(rule.width)*factor:fallback?.[0]??null,heightMm:rule.height?Number(rule.height)*factor:fallback?.[1]??null}}

export function createPrintingPhaseOneService(pool:Pool=db,dependencies:{inspect?:typeof inspectPrintDocument;analyze?:typeof analyzePrintPages;store?:typeof storePrintDocument;read?:typeof resolvePrintDocument;remove?:typeof removePrintDocument;clock?:()=>Date}={}) {
  const repository=new PrintingRepository(pool),inspect=dependencies.inspect??inspectPrintDocument,analyze=dependencies.analyze??analyzePrintPages
  const storage={store:dependencies.store??storePrintDocument,read:dependencies.read??resolvePrintDocument,remove:dependencies.remove??removePrintDocument},clock=dependencies.clock??(()=>new Date())
  async function user(actor:Actor) {
    if(!['Student','Faculty'].includes(String(actor.role))||!actor.schoolId)throw problem('Sign in with a borrower account.',403)
    const [rows]=await pool.execute<RowDataPacket[]>(`SELECT u.user_id FROM users u JOIN accounts a ON a.user_id=u.user_id
      WHERE u.school_id=? AND u.account_status='Active' AND a.account_status='Active' AND a.role=? AND a.account_id=?`,[actor.schoolId,actor.role,actor.accountId])
    if(!rows[0])throw problem('Your account cannot use this printing request.',403)
    return Number(rows[0].user_id)
  }
  async function setup(q:Reader=pool,lock=false):Promise<PrintSetup> {
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM printing_phase_one_settings WHERE settings_id=1${lock?' FOR SHARE':''}`),row=rows[0]
    if(!row)throw problem('Printing setup is unavailable. Contact the library.',503)
    return {version:Number(row.row_version),imageFeeMono:Number(row.image_fee_mono_centavos),imageFeeColor:Number(row.image_fee_color_centavos),scheduleEnabled:Boolean(row.schedule_enabled),weekly:row.weekly_windows as any,exceptions:row.date_exceptions as any}
  }
  async function availability(settings?:PrintSetup,q?:Reader) {
    const legacy=q?(await q.execute<RowDataPacket[]>('SELECT accepting_requests,unavailable_reason FROM printing_service_settings WHERE settings_id=1 FOR SHARE'))[0][0]:await repository.serviceStatus(),window=printingWindow(settings??await setup(),clock())
    const paused=!Number(legacy.accepting_requests)
    return {...legacy,accepting_requests:!paused&&window.open?1:0,manually_accepting_requests:Number(legacy.accepting_requests),unavailable_reason:paused?legacy.unavailable_reason:window.reason,next_opening:paused?null:window.nextOpening,docx_auto_count_available:true,max_document_mb:process.env.VERCEL?4:10}
  }
  async function open(settings?:PrintSetup,q?:Reader){const status=await availability(settings,q);if(!status.accepting_requests)throw problem(String(status.unavailable_reason??'Printing is closed.'));return status}
  async function transaction<T>(work:(q:PoolConnection)=>Promise<T>){const q=await pool.getConnection();try{await q.beginTransaction();const result=await work(q);await q.commit();return result}catch(error){await q.rollback();if((error as {code?:string}).code==='23505')throw problem('This document was already submitted. Refresh your requests.',409);throw error}finally{q.release()}}
  async function rates(q:PoolConnection,paper:string){const mono=await lockPaperPrice(q,paper,'Monochrome'),color=await lockPaperPrice(q,paper,'Colored');if(mono.brandId!==color.brandId)throw problem('The loaded paper changed. Review the quote.',409);return {mono:amountCents(mono.price),color:amountCents(color.price),brandId:mono.brandId,brand:mono.brandName}}
  async function analysis(owner:number,id:unknown,q:Reader=pool,lock=false){
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM printing_document_analyses WHERE analysis_id=? AND user_id=? AND expires_at>NOW()${lock?' FOR UPDATE':''}`,[uuid(id),owner])
    if(!rows[0])throw problem('This document preview expired or is unavailable. Select the document again.',409)
    return rows[0]
  }
  async function prepare(owner:number,body:Record<string,unknown>,file?:Express.Multer.File) {
    const paper=String(body.paper_size??'').trim()
    if(!paper||paper.length>100)throw problem('Choose a paper size.')
    const pricing=await repository.pricing(),rule=pricing.find(row=>row.paper_size===paper)
    if(!rule)throw problem('Choose an available paper size.')
    const spec=paperSpec(rule,paper)
    if(body.analysis_id){const saved=await analysis(owner,body.analysis_id);if(saved.paper_size===paper&&samePaper(saved.page_findings.paper,spec))return saved}
    if(!file)throw problem('Select the document again for the updated paper dimensions.',409)
    if(file.mimetype.includes('wordprocessingml')&&(!spec.widthMm||!spec.heightMm))throw problem('Set the paper dimensions before using DOCX with this size.')
    const document=await inspect(file,{paper:spec.widthMm&&spec.heightMm?{widthMm:spec.widthMm,heightMm:spec.heightMm}:undefined})
    const result={...await analyze(document.printableFile.buffer),paper:spec,rendererVersion:file.mimetype.includes('wordprocessingml')?'docx-preview-0.4.1-pdf-v1':'pdf-pass-through-v1'}
    const stored=await storage.store(document.printableFile),id=randomUUID()
    try {
      await transaction(async q=>{
        await q.execute('SELECT pg_advisory_xact_lock(?,?)',[74053,owner])
        const [pending]=await q.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM printing_document_analyses a WHERE a.user_id=? AND a.expires_at>NOW() AND NOT EXISTS(SELECT 1 FROM print_requests p WHERE p.analysis_id=a.analysis_id)',[owner])
        if(Number(pending[0].count)>=5)throw problem('You have several document previews open. Submit a request or wait for an older preview to expire.',429)
        await q.execute('INSERT INTO printing_document_analyses(analysis_id,user_id,source_hash,paper_size,source_name,printable_path,page_findings) VALUES(?,?,?,?,?,?,?::jsonb)',[id,owner,document.sourceHash,paper,document.printableName,stored.storedPath,JSON.stringify(result)])
      })
    }catch(error){await storage.remove(stored.storedPath);throw error}
    return {analysis_id:id,user_id:owner,source_hash:document.sourceHash,paper_size:paper,source_name:document.printableName,printable_path:stored.storedPath,page_findings:result}
  }
  function describe(body:Record<string,unknown>,pages:PageFinding[],settings:PrintSetup,price:Awaited<ReturnType<typeof rates>>,serviceKind:string) {
    const copies=whole(body.number_of_copies,'copies',100),mode=outputMode(body.print_type)
    const bill=pricePages(pages,copies,mode,price.mono,price.color,settings)
    const needsReview=serviceKind==='Photocopy'||pages.some(row=>row.imageReview&&(mode==='Colored'||mode==='Automatic'&&row.hasColor?settings.imageFeeColor:settings.imageFeeMono)>0)
    return {bill,copies,mode,needsReview}
  }
  return {
    serviceStatus:availability,
    async configuration(){const value=await setup();return {...value,imageFeeMono:value.imageFeeMono/100,imageFeeColor:value.imageFeeColor/100,availability:await availability(value)}},
    async saveConfiguration(actor:Actor,body:Record<string,unknown>){
      const input=parseSetup(body)
      await transaction(async q=>{
        await requireLibraryActor(q,whole(actor.accountId,'account ID',Number.MAX_SAFE_INTEGER),'library.manage')
        const [rows]=await q.execute<RowDataPacket[]>('SELECT row_version FROM printing_phase_one_settings WHERE settings_id=1 FOR UPDATE')
        if(Number(rows[0]?.row_version)!==input.version)throw problem('Printing settings changed. Reopen them before saving.',409)
        await q.execute('UPDATE printing_phase_one_settings SET image_fee_mono_centavos=?,image_fee_color_centavos=?,schedule_enabled=?,weekly_windows=?::jsonb,date_exceptions=?::jsonb,row_version=row_version+1,updated_at=NOW() WHERE settings_id=1',[input.imageFeeMono,input.imageFeeColor,input.scheduleEnabled,JSON.stringify(input.weekly),JSON.stringify(input.exceptions)])
        await q.execute('INSERT INTO printing_setup_events(actor_account_id,settings_version,details) VALUES(?,?,?::jsonb)',[actor.accountId,input.version+1,JSON.stringify(input)])
      });return this.configuration()
    },
    async quote(actor:Actor,body:Record<string,unknown>,file?:Express.Multer.File){
      const owner=await user(actor),settings=await setup()
      const kind=body.service_kind??'Print';if(!['Print','Photocopy'].includes(String(kind)))throw problem('Choose Print or Photocopy.')
      const saved=kind==='Print'?await prepare(owner,body,file):null
      const pages:PageFinding[]=saved?findings(saved.page_findings):Array.from({length:whole(body.page_count,'original pages')},(_,index)=>({page:index+1,hasColor:body.print_type==='Colored',hasImage:false,imageReview:true}))
      return transaction(async q=>{const price=await rates(q,String(body.paper_size)),{bill,copies,mode,needsReview}=describe(body,pages,settings,price,String(kind));return {analysis_id:saved?.analysis_id??null,document_sha256:saved?.source_hash??null,printable_file_name:saved?.source_name??'Photocopy originals',page_count:pages.length,total_sheets:pages.length*copies,calculated_cost:bill.totalCentavos/100,price_per_page:(mode==='Colored'?price.color:price.mono)/100,paper_brand_stock_id:price.brandId,paper_brand:price.brand,pricing:bill,pages,needs_review:needsReview,settings_version:settings.version,preview_url:saved?`/api/v1/printing/analyses/${saved.analysis_id}/preview`:null}})
    },
    async preview(actor:Actor,id:unknown){const saved=await analysis(await user(actor),id);return storage.read(String(saved.printable_path))},
    async submit(actor:Actor,body:Record<string,unknown>){
      const owner=await user(actor),key=uuid(body.request_key),kind=String(body.service_kind??'Print')
      if(!['Print','Photocopy'].includes(kind))throw problem('Choose Print or Photocopy.')
      const created=await transaction(async q=>{
        // Serializes retries from this owner without a process-local-only lock.
        await q.execute('SELECT pg_advisory_xact_lock(?,?)',[74053,owner])
        const [existing]=await q.execute<RowDataPacket[]>('SELECT * FROM print_requests WHERE user_id=? AND client_request_key=?',[owner,key])
        if(existing[0]){const previous=existing[0];if(previous.service_kind!==kind||previous.paper_size!==body.paper_size||Number(previous.number_of_copies)!==Number(body.number_of_copies)||previous.output_mode!==body.print_type||(previous.analysis_id??null)!==(kind==='Print'?body.analysis_id:null))throw problem('This submission reference was already used for another request.',409);return {request_id:Number(previous.request_id),file_name:previous.file_name,calculated_cost:Number(previous.calculated_cost),pricing_review_state:previous.pricing_review_state,payment_status:previous.payment_status,job_status:previous.job_status}}
        const settings=await setup(q,true);await open(settings,q)
        if(Number(body.settings_version)!==settings.version)throw problem('Printing settings changed. Review a fresh quote.',409)
        const saved=kind==='Print'?await analysis(owner,body.analysis_id,q,true):null
        const paper=String(body.paper_size??'')
        if(saved&&saved.paper_size!==paper)throw problem('Paper size changed. Review a new preview.',409)
        if(saved&&body.document_sha256!==saved.source_hash)throw problem('The document changed. Review a new preview.',409)
        const pages:PageFinding[]=saved?findings(saved.page_findings):Array.from({length:whole(body.page_count,'original pages')},(_,index)=>({page:index+1,hasColor:body.print_type==='Colored',hasImage:false,imageReview:true}))
        const price=await rates(q,paper)
        if(saved){const [details]=await q.execute<RowDataPacket[]>('SELECT d.width,d.height,d.dimension_unit FROM bond_paper_stocks p LEFT JOIN print_supply_details d ON d.paper_stock_id=p.paper_stock_id WHERE p.paper_size_dimension=?',[paper]);if(!samePaper(saved.page_findings.paper,paperSpec(details[0]??{},paper)))throw problem('Paper dimensions changed. Review a fresh document preview.',409)}
        const {bill,copies,mode,needsReview}=describe(body,pages,settings,price,kind)
        if(Number(body.paper_brand_stock_id??0)!==Number(price.brandId??0)||Number(body.quoted_mono_rate)!==price.mono||Number(body.quoted_color_rate)!==price.color||amountCents(body.quoted_cost)!==bill.totalCentavos)throw problem('The price changed. Review the updated quote.',409)
        const notes=String(body.optional_notes??'').trim();if(notes.length>1000)throw problem('Notes must not exceed 1,000 characters.')
        const paymentMethodRaw=body.payment_method===undefined||body.payment_method===''?'Online':String(body.payment_method)
        if(!['Cash','Online'].includes(paymentMethodRaw))throw problem('Choose Cash or Online payment.')
        const [result]=await q.execute<ResultSetHeader>(`INSERT INTO print_requests(user_id,file_name,file_path,number_of_copies,print_type,paper_size,page_count,total_sheets,optional_notes,calculated_cost,payment_status,job_status,paper_brand_stock_id,paper_brand_snapshot,unit_price_snapshot,service_kind,output_mode,pricing_review_state,pricing_snapshot,page_findings,analysis_id,client_request_key)
          VALUES(?,?,?,?,?,?,?,?,?,?,'Unpaid','Pending',?,?,?,?,?,?,?::jsonb,?::jsonb,?,?)`,[owner,saved?.source_name??'Photocopy originals',saved?.printable_path??'counter-originals',copies,bill.colorPages?'Colored':'Monochrome',paper,pages.length,pages.length*copies,notes||null,bill.totalCentavos/100,price.brandId,price.brand,(bill.colorPages?price.color:price.mono)/100,kind,mode,needsReview?'Pending':'Ready',JSON.stringify(bill),JSON.stringify(pages),saved?.analysis_id??null,key])
        const [hasPaymentCol]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='print_requests' AND column_name='preferred_payment_method' LIMIT 1`)
        if(hasPaymentCol.length&&result.insertId){await q.execute('UPDATE print_requests SET preferred_payment_method=? WHERE request_id=?',[paymentMethodRaw,result.insertId])}
        await q.execute("INSERT INTO print_status_history(request_id,from_status,to_status,changed_by_user_id,reason) VALUES(?,NULL,'Pending',?,?)",[result.insertId,owner,needsReview?'Submitted for page/price review':'Submitted with reviewed document quote'])
        return {request_id:Number(result.insertId),file_name:saved?.source_name??'Photocopy originals',calculated_cost:bill.totalCentavos/100,pricing_review_state:needsReview?'Pending':'Ready',payment_status:'Unpaid',job_status:'Pending'}
      })
      const { notifyStaffRolesSafe } = await import('../notifications/transaction-notifications.ts')
      await notifyStaffRolesSafe(pool,{key:`print:${created.request_id}:submitted`,title:'New print request submitted',body:`${created.file_name} (PHP ${Number(created.calculated_cost).toFixed(2)}) — Request #${created.request_id}.`,type:'Printing Update',sourceType:'Print Request',sourceId:created.request_id,personUserId:owner,librarianPath:'/librarian/printing',staffPath:'/staff/printing',priority:'Important'})
      return created
    },
    async review(actor:Actor,id:unknown,body:Record<string,unknown>){
      return transaction(async q=>{
        await requireLibraryActor(q,whole(actor.accountId,'account ID',Number.MAX_SAFE_INTEGER),'desk.operate')
        const settings=await setup(q,true),requestId=whole(id,'request ID',Number.MAX_SAFE_INTEGER)
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM print_requests WHERE request_id=? FOR UPDATE',[requestId]),row=rows[0]
        if(!row||row.pricing_review_state!=='Pending'||row.job_status!=='Pending'||row.payment_status!=='Unpaid'||Number(row.row_version)!==Number(body.version))throw problem('This request changed or is not awaiting a price review. Refresh it.',409)
        const count=row.service_kind==='Photocopy'?whole(body.page_count,'verified original pages'):Number(row.page_count)
        const images=pageNumbers(body.image_pages,count),colors=pageNumbers(body.color_pages,count),mode=outputMode(row.output_mode??row.print_type)
        const pages:PageFinding[]=Array.from({length:count},(_,index)=>({page:index+1,hasImage:images.includes(index+1),hasColor:colors.includes(index+1),imageReview:false}))
        const reason=String(body.reason??'').trim();if(reason.length<5||reason.length>500)throw problem('Record a short reason for the page review (5–500 characters).')
        const price=await rates(q,String(row.paper_size)),bill=pricePages(pages,Number(row.number_of_copies),mode,price.mono,price.color,settings,images)
        await q.execute(`UPDATE print_requests SET page_count=?,total_sheets=?,print_type=?,calculated_cost=?,pricing_snapshot=?::jsonb,page_findings=?::jsonb,pricing_review_state='Awaiting confirmation',paper_brand_stock_id=?,paper_brand_snapshot=?,unit_price_snapshot=?,row_version=row_version+1,updated_at=NOW() WHERE request_id=?`,[count,count*Number(row.number_of_copies),bill.colorPages?'Colored':'Monochrome',bill.totalCentavos/100,JSON.stringify(bill),JSON.stringify(pages),price.brandId,price.brand,(bill.colorPages?price.color:price.mono)/100,requestId])
        const [staff]=await q.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actor.accountId])
        await q.execute("INSERT INTO printing_price_review_events(request_id,actor_user_id,event_type,details) VALUES(?,?,'Reviewed',?::jsonb)",[requestId,staff[0].user_id,JSON.stringify({reason,bill,pages})])
        await q.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,delivered_at)
          SELECT u.user_id,'Review your printing price',?,'Printing Update','Print Request',?,CASE WHEN u.user_role='Faculty' THEN '/faculty/printing' ELSE '/student/printing' END,'Normal',?,NOW() FROM users u WHERE u.user_id=? ON CONFLICT(user_id,dedupe_key) DO NOTHING`,[`Request #${requestId} has been reviewed. Confirm the final price before payment.`,requestId,`printing-price:${requestId}:${Number(row.row_version)+1}`,row.user_id])
        return {request_id:requestId,pricing_review_state:'Awaiting confirmation',calculated_cost:bill.totalCentavos/100}
      })
    },
    async accept(actor:Actor,id:unknown,body:Record<string,unknown>){
      const owner=await user(actor)
      const accepted=await transaction(async q=>{
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM print_requests WHERE request_id=? AND user_id=? FOR UPDATE',[whole(id,'request ID',Number.MAX_SAFE_INTEGER),owner]),row=rows[0]
        if(!row||row.pricing_review_state!=='Awaiting confirmation'||row.job_status!=='Pending'||Number(row.row_version)!==Number(body.version)||amountCents(body.amount)!==amountCents(row.calculated_cost))throw problem('This price changed. Refresh and review it again.',409)
        await q.execute("UPDATE print_requests SET pricing_review_state='Ready',row_version=row_version+1,updated_at=NOW() WHERE request_id=?",[row.request_id])
        await q.execute("INSERT INTO printing_price_review_events(request_id,actor_user_id,event_type,details) VALUES(?,?,'Accepted',?::jsonb)",[row.request_id,owner,JSON.stringify({amount:row.calculated_cost,version:row.row_version})])
        return {request_id:Number(row.request_id),pricing_review_state:'Ready',row_version:Number(row.row_version),calculated_cost:Number(row.calculated_cost)}
      })
      const { notifyStaffRolesSafe } = await import('../notifications/transaction-notifications.ts')
      await notifyStaffRolesSafe(pool,{key:`print:${accepted.request_id}:price-accepted:${accepted.row_version}`,title:'Printing price accepted',body:`Request #${accepted.request_id} reviewed price (PHP ${accepted.calculated_cost.toFixed(2)}) was accepted by the requester.`,type:'Printing Update',sourceType:'Print Request',sourceId:accepted.request_id,personUserId:owner,librarianPath:'/librarian/printing',staffPath:'/staff/printing',priority:'Normal'})
      return {request_id:accepted.request_id,pricing_review_state:'Ready'}
    },
    async requestPreview(actor:Actor,id:unknown,staff=false){
      const requestId=whole(id,'request ID',Number.MAX_SAFE_INTEGER),owner=staff?null:await user(actor)
      if(staff){const q=await pool.getConnection();try{await requireLibraryActor(q,whole(actor.accountId,'account ID',Number.MAX_SAFE_INTEGER),'desk.operate')}finally{q.release()}}
      const [rows]=await pool.execute<RowDataPacket[]>(`SELECT file_path,service_kind,documents_expired_at FROM print_requests WHERE request_id=?${staff?'':' AND user_id=?'}`,[requestId,...(staff?[]:[owner])])
      if(rows[0]?.documents_expired_at)throw problem('The document expired after ten days. Receipts and history remain available.',410)
      if(!rows[0]||rows[0].service_kind==='Photocopy')throw problem('No uploaded document is available for this request.',404)
      return storage.read(String(rows[0].file_path))
    },
    async cleanupExpired(){
      // Request-linked artifacts remain protected; Phase 5 owns completed-job retention.
      return transaction(async q=>{
        const [rows]=await q.execute<RowDataPacket[]>(`SELECT a.analysis_id,a.printable_path FROM printing_document_analyses a WHERE a.expires_at<NOW() AND NOT EXISTS(SELECT 1 FROM print_requests p WHERE p.analysis_id=a.analysis_id) ORDER BY a.expires_at LIMIT 5 FOR UPDATE OF a SKIP LOCKED`)
        for(const row of rows){await Promise.race([storage.remove(String(row.printable_path)),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(problem('Document cleanup timed out.',503)),5000);timer.unref()})]);await q.execute('DELETE FROM printing_document_analyses WHERE analysis_id=?',[row.analysis_id])}
        return rows.length
      })
    },
  }
}
export const printingPhaseOneService=createPrintingPhaseOneService()
