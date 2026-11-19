import {db,type Pool,type RowDataPacket,type ResultSetHeader} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'

type Actor={accountId?:number}
type InkColorTypeRow=RowDataPacket&{ink_color_type_id:number;cartridge_type:string;color_variation:string}
export function parseInkColorType(body:Record<string,unknown>){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(422,'INK_COLOR_TYPE_INVALID','Enter the ink type and color.')
  if(Object.keys(body).some(key=>!['cartridge_type','color_variation'].includes(key)))throw new HttpError(422,'INK_COLOR_TYPE_INVALID','Enter only the ink type and color. Add bottles through Add ink stock.')
  const cartridgeType=String(body.cartridge_type??'').trim().replace(/ +/g,' '),color=String(body.color_variation??'').trim().replace(/ +/g,' ')
  if(cartridgeType.length<2||cartridgeType.length>100||/[\u0000-\u001f\u007f]/.test(cartridgeType))throw new HttpError(422,'INK_TYPE_INVALID','Enter an ink type, up to 100 characters.')
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ()/.-]{0,59}$/u.test(color))throw new HttpError(422,'INK_COLOR_INVALID','Enter a color name, up to 60 characters.')
  return {cartridgeType,color}
}
export function createInkColorTypesService(database:Pool=db){
  return {
    async list(actor:Actor){
      await requireLibraryActor(database,actor.accountId!,'library.manage')
      const [rows]=await database.execute<InkColorTypeRow[]>('SELECT ink_color_type_id,cartridge_type,color_variation FROM ink_color_types ORDER BY cartridge_type,color_variation')
      return rows
    },
    async update(actor:Actor,value:unknown,body:Record<string,unknown>){
      const id=Number(value)
      if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'INK_COLOR_TYPE_INVALID','Choose a saved ink type.')
      if(Object.keys(body).some(key=>!['cartridge_type','color_variation','expected_cartridge_type','expected_color_variation'].includes(key)))throw new HttpError(422,'INK_COLOR_TYPE_INVALID','Edit only the ink type and color.')
      const input=parseInkColorType({cartridge_type:body.cartridge_type,color_variation:body.color_variation}),q=await database.getConnection()
      try{
        await q.beginTransaction();await requireLibraryActor(q,actor.accountId!,'library.manage')
        const [definitions]=await q.execute<InkColorTypeRow[]>('SELECT * FROM ink_color_types WHERE ink_color_type_id=? FOR UPDATE',[id])
        const before=definitions[0]
        if(!before)throw new HttpError(404,'INK_COLOR_TYPE_NOT_FOUND','This ink type is no longer available. Refresh the list.')
        if(before.cartridge_type!==body.expected_cartridge_type||before.color_variation!==body.expected_color_variation)throw new HttpError(409,'INK_COLOR_TYPE_CHANGED','This ink type changed. Close the form and choose it again.')
        await q.execute('UPDATE ink_color_types SET cartridge_type=?,color_variation=? WHERE ink_color_type_id=?',[input.cartridgeType,input.color,id])
        const [stocks]=await q.execute<RowDataPacket[]>('SELECT * FROM ink_repository WHERE deleted_at IS NULL AND lower(trim(cartridge_type))=lower(trim(?)) AND lower(trim(color_variation))=lower(trim(?)) ORDER BY ink_id FOR UPDATE',[before.cartridge_type,before.color_variation])
        for(const stock of stocks){
          await q.execute('UPDATE ink_repository SET cartridge_type=?,color_variation=?,updated_at=NOW() WHERE ink_id=?',[input.cartridgeType,input.color,stock.ink_id])
          await q.execute('INSERT INTO ink_stock_changes(ink_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[stock.ink_id,actor.accountId,JSON.stringify(stock),JSON.stringify({...stock,cartridge_type:input.cartridgeType,color_variation:input.color})])
        }
        await q.commit();return {ink_color_type_id:id,cartridge_type:input.cartridgeType,color_variation:input.color,updated_items:stocks.length}
      }catch(error){await q.rollback();if((error as {code?:string}).code==='23505')throw new HttpError(409,'INK_COLOR_TYPE_EXISTS','That ink type and color already exist. Choose a different name.');throw error}finally{q.release()}
    },
    async save(actor:Actor,body:Record<string,unknown>){
      const input=parseInkColorType(body),q=await database.getConnection()
      try{
        await q.beginTransaction();await requireLibraryActor(q,actor.accountId!,'library.manage')
        const [result]=await q.execute<ResultSetHeader>(`INSERT INTO ink_color_types(cartridge_type,color_variation,created_by_account_id) VALUES(?,?,?)
          ON CONFLICT(lower(trim(cartridge_type)),lower(trim(color_variation))) DO NOTHING RETURNING ink_color_type_id`,[input.cartridgeType,input.color,actor.accountId])
        const [rows]=await q.execute<InkColorTypeRow[]>('SELECT ink_color_type_id,cartridge_type,color_variation FROM ink_color_types WHERE lower(trim(cartridge_type))=lower(?) AND lower(trim(color_variation))=lower(?)',[input.cartridgeType,input.color])
        await q.commit();return {...rows[0],already_saved:!result.affectedRows}
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
  }
}
export const inkColorTypesService=createInkColorTypesService()
