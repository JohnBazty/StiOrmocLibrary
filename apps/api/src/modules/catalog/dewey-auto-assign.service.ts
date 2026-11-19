import { classifySubject, LOCAL_DDC_VERSION } from './ddc-subject-rules.ts'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { deweyLookup, deweyCode } from './dewey-lookup.service.ts'
import { assignDeweyCopies } from './dewey.service.ts'
import { isbnValidationMessage, normalizeIsbn } from './catalog.validation.ts'

export type AutomaticAssignmentResult={title:string;titleId:number|null;outcome:string;assignedCopies:number;remainingForTitle?:boolean;nextToken:string|null}
type Scope = { actor:number; expires:number; maxCopy:number; after:number; titleIds:number[]|null;ruleVersion?:string }
type Query = Pick<PoolConnection,'execute'>
const eligible = "pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book' AND pc.dewey_classification_id IS NULL"
const conflict = () => new HttpError(409,'DEWEY_SCOPE_EXPIRED','This selection expired or changed. Select your books and start again.')
async function rows(query:Query,statement:string,values:unknown[]=[]) {
  const [result]=await query.execute<RowDataPacket[]>(statement,values)
  return result
}
export function createAutomaticDewey(database:Pool=db,lookup?:Pick<typeof deweyLookup,'lookup'>,secret=env.jwt.secret) {
  function sign(scope:Scope) {
    const payload=Buffer.from(JSON.stringify(scope)).toString('base64url')
    return payload+'.'+createHmac('sha256',secret).update('dewey-auto:'+payload).digest('base64url')
  }
  function read(value:unknown,actor:number):Scope {
    if(typeof value!=='string'||value.length>30000)throw conflict()
    const [payload,signature,...extra]=value.split('.')
    const expected=createHmac('sha256',secret).update('dewey-auto:'+payload).digest('base64url')
    if(extra.length||!signature||!/^[A-Za-z0-9_-]{43}$/.test(signature)||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw conflict()
    try {const scope=JSON.parse(Buffer.from(payload,'base64url').toString()) as Scope
      if(scope.actor!==actor||scope.expires<Date.now()||(!lookup&&scope.ruleVersion!==LOCAL_DDC_VERSION))throw conflict()
      return scope
    } catch {throw conflict()}
  }
  async function authorize(actor:number) {await requireLibraryActor(database,actor,'library.manage')}
  return {
    async books(query:Record<string,unknown>) {
      const page=Number(query.page??1),q=String(query.q??'').trim().slice(0,120)
      if(!Number.isSafeInteger(page)||page<1||page>10000)throw new HttpError(422,'DEWEY_PAGE_INVALID','Choose a valid page.')
      const where=eligible+" AND (STRPOS(LOWER(t.title),LOWER(?))>0 OR STRPOS(COALESCE(t.isbn,''),?)>0)"
      const [items,total,libraryTotal]=await Promise.all([
        rows(database,`SELECT t.title_id AS id,t.title,t.isbn,COUNT(*)::int AS copies FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${where} GROUP BY t.title_id ORDER BY t.title_id LIMIT 50 OFFSET ?`,[q,q,(page-1)*50]),
        rows(database,`SELECT COUNT(DISTINCT t.title_id)::int AS total FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${where}`,[q,q]),
        rows(database,`SELECT COUNT(DISTINCT t.title_id)::int AS total FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${eligible}`),
      ])
      return {libraryTotal:Number(libraryTotal[0].total),items:items.map(row=>({...row,id:Number(row.id),copies:Number(row.copies)})),total:Number(total[0].total),page}
    },
    async start(body:unknown,actor:number) {
      await authorize(actor)
      const input=body as {all?:unknown;titleIds?:unknown}
      if(!input||typeof input!=='object')throw new HttpError(422,'DEWEY_SELECTION_INVALID','Select books without Dewey.')
      let titleIds:number[]|null=null
      if(input.all!==true) {
        if(!Array.isArray(input.titleIds)||!input.titleIds.length||input.titleIds.length>1000||input.titleIds.some(id=>typeof id!=='number'||!Number.isSafeInteger(id)||id<1))throw new HttpError(422,'DEWEY_SELECTION_INVALID','Select between 1 and 1000 books, or choose all books.')
        titleIds=[...new Set(input.titleIds as number[])]
      } else if(input.titleIds!==undefined)throw new HttpError(422,'DEWEY_SELECTION_INVALID','Choose selected books or all books.')
      const [summary]=await rows(database,`SELECT COALESCE(MAX(pc.physical_copy_id),0) AS maximum,COUNT(*)::int AS copies,COUNT(DISTINCT t.title_id)::int AS books FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${eligible}${titleIds?' AND t.title_id=ANY(?::bigint[])':''}`,titleIds?[titleIds]:[])
      if(!Number(summary.books))throw new HttpError(422,'DEWEY_SELECTION_EMPTY','No selected books need a Dewey number.')
      return {token:sign({actor,expires:Date.now()+24*60*60*1000,maxCopy:Number(summary.maximum),after:0,titleIds,ruleVersion:LOCAL_DDC_VERSION}),books:Number(summary.books),copies:Number(summary.copies)}
    },
    async step(token:unknown,actor:number):Promise<AutomaticAssignmentResult> {
      const scope=read(token,actor)
      await authorize(actor)
      const selection=scope.titleIds?' AND t.title_id=ANY(?::bigint[])':''
      const candidates=await rows(database,`SELECT t.title_id AS id,t.title,t.isbn FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${eligible} AND pc.physical_copy_id<=? AND t.title_id>?${selection} GROUP BY t.title_id ORDER BY t.title_id LIMIT 1`,[scope.maxCopy,scope.after,...(scope.titleIds?[scope.titleIds]:[])])
      if(!candidates.length)return {title:'',titleId:null,outcome:'already_assigned',assignedCopies:0,nextToken:null}
      const book=candidates[0],isbn=normalizeIsbn(book.isbn)
      const next=sign({...scope,after:Number(book.id)})
      const more=await rows(database,`SELECT 1 FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${eligible} AND pc.physical_copy_id<=? AND t.title_id>?${selection} LIMIT 1`,[scope.maxCopy,book.id,...(scope.titleIds?[scope.titleIds]:[])])
      const result={title:String(book.title),titleId:Number(book.id),outcome:'missing_isbn',assignedCopies:0,nextToken:more.length?next:null as string|null}
      let description=''
      let candidate:{code:string;source:'open_library'|'local_rule';sourceUrl:string}
      if(lookup){
        if(!isbn||isbnValidationMessage(isbn))return result
        const found=await lookup.lookup(isbn)
        if(found.status!=='matched'||found.candidates.length!==1)return {...result,outcome:found.status}
        const foundCandidate=found.candidates[0]
        if(found.isbn!==isbn||!deweyCode(foundCandidate.code)||foundCandidate.source!=='open_library'||foundCandidate.sourceUrl!==`https://openlibrary.org/isbn/${isbn}`)return {...result,outcome:'invalid_match'}
        candidate=foundCandidate
      }else{
        const details=await rows(database,'SELECT synopsis FROM catalog_title_details WHERE title_id=?',[book.id])
        description=String(details[0]?.synopsis??'')
        const decision=classifySubject(String(book.title),description)
        if(!decision.code)return {...result,outcome:'needs_review'}
        candidate={code:decision.code,source:'local_rule',sourceUrl:'local-rule:'+decision.version+':'+decision.code}
      }
      const connection=await database.getConnection()
      try {
        await connection.beginTransaction()
        await requireLibraryActor(connection,actor,'library.manage')
        const title=(await rows(connection,'SELECT title,isbn,lifecycle_status FROM titles WHERE title_id=? FOR UPDATE',[book.id]))[0]
        if(!title||title.lifecycle_status!=='Active'||(lookup?normalizeIsbn(title.isbn)!==isbn:title.title!==book.title)){await connection.rollback();return {...result,outcome:'changed'}}
        if(!lookup){const details=await rows(connection,'SELECT synopsis FROM catalog_title_details WHERE title_id=?',[book.id]);if(String(details[0]?.synopsis??'')!==description){await connection.rollback();return {...result,outcome:'changed'}}}
        const copies=await rows(connection,`SELECT physical_copy_id AS id,dewey_version AS version FROM physical_copies WHERE title_id=? AND physical_copy_id<=? AND lifecycle_status='Active' AND dewey_classification_id IS NULL ORDER BY physical_copy_id LIMIT 50 FOR UPDATE`,[book.id,scope.maxCopy])
        // Decisions are reconstructed on the server before assignment.
        await assignDeweyCopies(connection,{code:candidate.code,source:candidate.source,sourceUrl:candidate.sourceUrl,isbn},copies.map(copy=>({id:Number(copy.id),version:Number(copy.version)})),actor)
        const remaining=await rows(connection,`SELECT 1 FROM physical_copies WHERE title_id=? AND physical_copy_id<=? AND lifecycle_status='Active' AND dewey_classification_id IS NULL LIMIT 1`,[book.id,scope.maxCopy])
        await connection.commit()
        return {...result,outcome:copies.length?'assigned':'already_assigned',assignedCopies:copies.length,remainingForTitle:Boolean(remaining.length),nextToken:remaining.length?sign({...scope,after:Number(book.id)-1}):result.nextToken}
      } catch(error) {
        await connection.rollback()
        if(error instanceof HttpError&&['DEWEY_ARCHIVED','DEWEY_COPY_CHANGED','DEWEY_ISBN_CHANGED','DEWEY_COPY_UNAVAILABLE'].includes(error.code))return {...result,outcome:error.code==='DEWEY_ARCHIVED'?'archived':'changed'}
        throw error
      } finally {connection.release()}
    },
  }
}
export const automaticDewey=createAutomaticDewey()
