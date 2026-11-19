import type {Pool,RowDataPacket} from '../../config/db.js'
import {db} from '../../config/db.js'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import {HttpError} from '../../core/http-error.ts'
import {removePrintDocument} from './printing.storage.ts'
const TEN_DAYS=10*24*60*60*1000
export function retentionEligible(row:Record<string,unknown>,now=new Date()){
 return row.job_status==='Completed'&&!row.document_retention_hold&&!row.documents_expired_at&&row.completed_at!=null&&new Date(String(row.completed_at)).getTime()+TEN_DAYS<=now.getTime()
}
export function createDocumentRetention(database:Pool=db,remove=removePrintDocument){
 return {
  async list(accountId:number){const q=await database.getConnection();try{await requireLibraryActor(q,accountId,'library.manage');const [rows]=await q.execute<RowDataPacket[]>(`SELECT request_id,file_name,job_status,completed_at,document_retention_hold,documents_expired_at,completed_at+INTERVAL '10 days' AS expires_at FROM print_requests WHERE job_status='Completed' ORDER BY completed_at DESC,request_id DESC LIMIT 100`);return rows}finally{q.release()}},
  async hold(accountId:number,id:unknown,body:Record<string,unknown>){
   const reason=typeof body.reason==='string'?body.reason.trim():''
   if(!Number.isSafeInteger(Number(id))||Number(id)<1||typeof body.hold!=='boolean'||!reason||reason.length>1000)throw new HttpError(422,'RETENTION_INVALID','Choose hold or release and explain the reason.')
   const q=await database.getConnection();try{await q.beginTransaction();await requireLibraryActor(q,accountId,'library.manage');const [rows]=await q.execute<RowDataPacket[]>('SELECT request_id,documents_expired_at FROM print_requests WHERE request_id=? FOR UPDATE',[id]);if(!rows[0])throw new HttpError(404,'PRINT_REQUEST_NOT_FOUND','This print request is unavailable.');if(rows[0].documents_expired_at)throw new HttpError(409,'PRINT_DOCUMENT_EXPIRED','These documents have already expired. Financial history remains available.');await q.execute('UPDATE print_requests SET document_retention_hold=? WHERE request_id=?',[body.hold,id]);await q.execute('INSERT INTO print_retention_events(request_id,actor_account_id,event_type,reason) VALUES (?,?,?,?)',[id,accountId,body.hold?'Hold':'Release',reason]);await q.commit();return {saved:true}}catch(e){await q.rollback();throw e}finally{q.release()}
  },
  async cleanup(now=new Date()){
   const q=await database.getConnection();let removed=0,retry=0
   try{await q.beginTransaction();const [jobs]=await q.execute<RowDataPacket[]>(`SELECT p.request_id,p.file_path,a.printable_path FROM print_requests p LEFT JOIN printing_document_analyses a ON a.analysis_id=p.analysis_id WHERE p.job_status='Completed' AND p.completed_at<=?::timestamptz-INTERVAL '10 days' AND NOT p.document_retention_hold AND p.documents_expired_at IS NULL AND NOT EXISTS(SELECT 1 FROM print_document_manifest m WHERE m.request_id=p.request_id AND m.removed_at IS NULL AND m.retry_after>?) ORDER BY p.completed_at,p.request_id LIMIT 5 FOR UPDATE OF p SKIP LOCKED`,[now,now])
    for(const job of jobs){
     const paths=[...new Set([job.file_path,job.printable_path].filter((v):v is string=>typeof v==='string'&&v.length>0))]
     let complete=true
     for(const artifact of paths){
      await q.execute('INSERT INTO print_document_manifest(request_id,artifact_path) VALUES (?,?) ON CONFLICT DO NOTHING',[job.request_id,artifact])
      const [shared]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM print_requests p LEFT JOIN printing_document_analyses a ON a.analysis_id=p.analysis_id WHERE p.request_id<>? AND p.documents_expired_at IS NULL AND (p.file_path=? OR a.printable_path=?) LIMIT 1`,[job.request_id,artifact,artifact])
      if(shared.length){complete=false;await q.execute("UPDATE print_document_manifest SET retry_after=?::timestamptz+INTERVAL '1 hour',attempts=attempts+1 WHERE request_id=? AND artifact_path=?",[now,job.request_id,artifact]);continue}
      const [manifest]=await q.execute<RowDataPacket[]>('SELECT removed_at FROM print_document_manifest WHERE request_id=? AND artifact_path=?',[job.request_id,artifact]);if(manifest[0]?.removed_at)continue
      try{await remove(artifact);await q.execute('UPDATE print_document_manifest SET removed_at=?,attempts=attempts+1 WHERE request_id=? AND artifact_path=?',[now,job.request_id,artifact]);removed++}catch{complete=false;retry++;await q.execute("UPDATE print_document_manifest SET attempts=attempts+1,retry_after=?::timestamptz+INTERVAL '1 hour' WHERE request_id=? AND artifact_path=?",[now,job.request_id,artifact])}
     }
     if(complete){await q.execute('UPDATE print_requests SET documents_expired_at=? WHERE request_id=?',[now,job.request_id]);await q.execute("INSERT INTO print_retention_events(request_id,event_type,reason) VALUES (?,'Expired','Completed document retention reached ten days; financial history preserved.')",[job.request_id])}
     else await q.execute("INSERT INTO print_retention_events(request_id,event_type,reason) VALUES (?,'Retry','Document removal incomplete; retry on a later runner pass.')",[job.request_id])
    }await q.commit();return {removed,retry}
   }catch(e){await q.rollback();throw e}finally{q.release()}
  },
 }
}
