import { createHash } from 'node:crypto'
import type { Pool,PoolConnection,RowDataPacket } from 'mysql2/promise'
import { db,dbDriver } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { invalid,text } from './maintenance-validation.ts'
export function createMaintenanceStore(database:Pool=db,driver=dbDriver){
  async function read<T>(actor:number,work:(q:PoolConnection)=>Promise<T>){
    if(driver!=='postgres')throw new HttpError(503,'MAINTENANCE_UNAVAILABLE','This feature needs the current Postgres database.')
    const q=await database.getConnection()
    try{await q.beginTransaction();await requireLibraryActor(q,actor,'library.manage');const result=await work(q);await q.commit();return result}catch(e){await q.rollback();const code=(e as {code?:string}).code;if(code==='23505')throw new HttpError(409,'MAINTENANCE_DUPLICATE','A record with these details already exists. Reload and use the existing record.');if(code==='22003')throw invalid('The total quantity or cost is too large. Check the entered amounts.');throw e}finally{q.release()}
  }
  async function write<T>(actor:number,key:unknown,input:unknown,work:(q:PoolConnection)=>Promise<T>){
    const commandKey=text(key,'Submission reference',36,true)
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandKey))throw invalid('Refresh the form to start a new submission.')
    const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return read(actor,async q=>{
      await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`${actor}:${commandKey}`])
      const [prior]=await q.execute<RowDataPacket[]>('SELECT input_hash,result FROM library_maintenance_commands WHERE actor_id=? AND command_key=?',[actor,commandKey])
      if(prior.length){if(prior[0].input_hash!==hash)throw new HttpError(409,'SUBMISSION_CHANGED','This submission was already saved with different details. Reload before making another change.');return prior[0].result as T}
      const result=await work(q)
      await q.execute('INSERT INTO library_maintenance_commands(actor_id,command_key,input_hash,result) VALUES (?,?,?,?::jsonb)',[actor,commandKey,hash,JSON.stringify(result)])
      return result
    })
  }
  return {read,write}
}
export async function audit(q:PoolConnection,actor:number,scope:string,recordId:number,reason:string,before:unknown,after:unknown){
  await q.execute('INSERT INTO library_maintenance_events(scope,record_id,actor_id,reason,before_data,after_data) VALUES (?,?,?,?,?::jsonb,?::jsonb)',[scope,recordId,actor,reason,before==null?null:JSON.stringify(before),JSON.stringify(after)])
}
export const maintenanceStore=createMaintenanceStore()
