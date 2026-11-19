import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { positiveId } from './payments.validation.ts'

type Actor={accountId?:number;role?:string}
export function createGcashAvailability(pool:Pool=db){
  const get=async()=>{
    const [rows]=await pool.execute<RowDataPacket[]>('SELECT enabled,version,updated_at FROM gcash_payment_settings WHERE singleton=TRUE')
    if(!rows[0])throw new HttpError(503,'GCASH_SETUP_UNAVAILABLE','Payment settings are unavailable. Contact the library.')
    return {enabled:rows[0].enabled===true,version:Number(rows[0].version),updated_at:rows[0].updated_at}
  }
  return {
    get,
    async requireAvailable(){if(!(await get()).enabled)throw new HttpError(409,'GCASH_UNAVAILABLE','GCash payments are temporarily unavailable. You can still check an existing payment or pay at the library.')},
    async save(actor:Actor,body:Record<string,unknown>){
      const reason=String(body.reason??'').trim(),version=positiveId(body.version)
      if(typeof body.enabled!=='boolean'||reason.length<3||reason.length>1000)throw new HttpError(422,'GCASH_SETTINGS_INVALID','Choose availability and enter a short reason.')
      const q=await pool.getConnection()
      try {
        await q.beginTransaction();await requireLibraryActor(q,positiveId(actor.accountId),'library.manage')
        const [staff]=await q.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actor.accountId])
        const [rows]=await q.execute<RowDataPacket[]>('SELECT version FROM gcash_payment_settings WHERE singleton=TRUE FOR UPDATE')
        if(Number(rows[0]?.version)!==version)throw new HttpError(409,'GCASH_SETTINGS_CHANGED','These settings changed. Refresh before saving.')
        await q.execute('UPDATE gcash_payment_settings SET enabled=?,version=version+1,updated_by_user_id=?,updated_at=NOW() WHERE singleton=TRUE',[body.enabled,staff[0].user_id])
        await q.execute('INSERT INTO gcash_payment_setting_events(enabled,version,reason,actor_user_id) VALUES(?,?,?,?)',[body.enabled,version+1,reason,staff[0].user_id])
        await q.commit();return get()
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
  }
}
export const gcashAvailability=createGcashAvailability()
