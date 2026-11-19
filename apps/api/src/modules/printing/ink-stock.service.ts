import {randomUUID} from 'node:crypto'
import {db,type Pool,type RowDataPacket,type ResultSetHeader} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import {parseInkColorType} from './ink-color-types.service.ts'
import {parseNewInkStock} from './printing.validation.ts'

type Actor={accountId?:number}
export function createInkStockService(database:Pool=db){
  return {
    async create(actor:Actor,body:Record<string,unknown>){
      const input=parseNewInkStock(body),brand=String(body.brand??'').trim(),key=String(body.client_request_id??randomUUID())
      if(!brand||brand.length>100||/[\u0000-\u001f\u007f]/.test(brand))throw new HttpError(422,'INK_BRAND_INVALID','Enter the ink brand, up to 100 characters.')
      if(!/^\d+(\.\d{1,2})?$/.test(String(body.cost_per_bottle)))throw new HttpError(422,'INK_COST_INVALID','Enter a cost per bottle with up to two decimal places.')
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))throw new HttpError(422,'INK_REQUEST_INVALID','Start a new ink stock entry and try again.')
      const q=await database.getConnection()
      try{
        await q.beginTransaction()
        await requireLibraryActor(q,actor.accountId!,'library.manage')
        const [definitions]=await q.execute<RowDataPacket[]>('SELECT ink_color_type_id FROM ink_color_types WHERE lower(trim(cartridge_type))=lower(?) AND lower(trim(color_variation))=lower(?) FOR SHARE',[input.cartridgeType,input.color])
        if(!definitions[0])throw new HttpError(422,'INK_COLOR_TYPE_REQUIRED','Save this color and ink type through Add new color type first.')
        const [accounts]=await q.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actor.accountId])
        const staffId=Number(accounts[0]?.user_id)
        if(!staffId)throw new HttpError(403,'PRINT_ACCOUNT_BLOCKED','Your library account is not linked to a staff profile.')
        // A stable form key serializes retries before creating either stock or expense.
        await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[key])
        const [prior]=await q.execute<RowDataPacket[]>(`SELECT i.*,d.brand,m.quantity_bottles,m.unit_cost_per_bottle,m.recorded_by_user_id
          FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id
          LEFT JOIN print_supply_details d ON d.ink_id=i.ink_id WHERE m.client_request_id=?`,[key])
        if(prior[0]){
          const row=prior[0]
          if(row.brand!==brand||row.cartridge_type!==input.cartridgeType||row.color_variation!==input.color||Number(row.quantity_bottles)!==input.bottles||Number(row.unit_cost_per_bottle)!==input.cost||Number(row.low_stock_threshold_bottles)!==input.threshold||Number(row.recorded_by_user_id)!==staffId)throw new HttpError(409,'INK_REQUEST_CHANGED','This stock entry was already saved. Start a new entry to change its details.')
          await q.commit();return {ink_id:Number(row.ink_id),already_recorded:true}
        }
        const identity=JSON.stringify([brand,input.cartridgeType,input.color].map(value=>value.toLowerCase()))
        await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[identity])
        const [existing]=await q.execute<RowDataPacket[]>(`SELECT i.ink_id FROM ink_repository i JOIN print_supply_details d ON d.ink_id=i.ink_id
          WHERE i.deleted_at IS NULL AND lower(d.brand)=lower(?) AND lower(i.cartridge_type)=lower(?) AND lower(i.color_variation)=lower(?)`,[brand,input.cartridgeType,input.color])
        if(existing[0])throw new HttpError(409,'INK_ALREADY_EXISTS','This brand, ink type and color already exist. Use Restock beside that item.')
        const [result]=await q.execute<ResultSetHeader>(`INSERT INTO ink_repository(printer_id,cartridge_type,color_variation,available_bottles,low_stock_threshold_bottles,cost_per_bottle,remaining_fluid_percentage,low_ink_threshold,last_replenished_at)
          VALUES(NULL,?,?,?,?,?,100,20,NOW())`,[input.cartridgeType,input.color,input.bottles,input.threshold,input.cost])
        const id=Number(result.insertId),expense=Number((input.bottles*input.cost).toFixed(2))
        await q.execute('INSERT INTO print_supply_details(ink_id,brand,updated_by) VALUES(?,?,?)',[id,brand,actor.accountId])
        await q.execute(`INSERT INTO ink_stock_movements(ink_id,movement_type,activity_code,quantity_bottles,unit_cost_per_bottle,expense_amount,balance_before,balance_after,recorded_by_user_id,notes,client_request_id)
          VALUES(?,'Restock','Restock',?,?,?,0,?,?,'Initial bottle stock',?)`,[id,input.bottles,input.cost,expense,input.bottles,staffId,key])
        await q.execute('INSERT INTO ink_stock_changes(ink_id,changed_by_account_id,after_values) VALUES(?,?,?::jsonb)',[id,actor.accountId,JSON.stringify({...input,brand})])
        await q.commit();return {ink_id:id,available_bottles:input.bottles,total_expense:expense,already_recorded:false}
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
    async update(actor:Actor,value:unknown,body:Record<string,unknown>){
      const id=Number(value)
      if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'INK_STOCK_INVALID','Choose a saved ink item.')
      if(Object.keys(body).some(key=>!['cartridge_type','color_variation','expected_cartridge_type','expected_color_variation'].includes(key)))throw new HttpError(422,'INK_EDIT_INVALID','Edit only the ink type and color. Use Restock to add bottles.')
      const input=parseInkColorType({cartridge_type:body.cartridge_type,color_variation:body.color_variation}),q=await database.getConnection()
      try{
        await q.beginTransaction();await requireLibraryActor(q,actor.accountId!,'library.manage')
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM ink_repository WHERE ink_id=? AND deleted_at IS NULL FOR UPDATE',[id])
        const before=rows[0]
        if(!before)throw new HttpError(404,'INK_STOCK_NOT_FOUND','The ink stock item was not found.')
        if(before.cartridge_type!==body.expected_cartridge_type||before.color_variation!==body.expected_color_variation)throw new HttpError(409,'INK_STOCK_CHANGED','This ink item changed. Close the form, refresh and review it again.')
        const [details]=await q.execute<RowDataPacket[]>('SELECT brand FROM print_supply_details WHERE ink_id=?',[id])
        const brand=String(details[0]?.brand??'')
        // Use the same identity lock as new stock entries to prevent duplicate brands/types/colors.
        const identity=JSON.stringify([brand,input.cartridgeType,input.color].map(value=>value.toLowerCase()))
        await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[identity])
        const [existing]=await q.execute<RowDataPacket[]>(`SELECT i.ink_id FROM ink_repository i LEFT JOIN print_supply_details d ON d.ink_id=i.ink_id
          WHERE i.deleted_at IS NULL AND i.ink_id<>? AND lower(COALESCE(d.brand,''))=lower(?) AND lower(i.cartridge_type)=lower(?) AND lower(i.color_variation)=lower(?)`,[id,brand,input.cartridgeType,input.color])
        if(existing[0])throw new HttpError(409,'INK_ALREADY_EXISTS','This brand, ink type and color already exist. Choose different details.')
        await q.execute(`INSERT INTO ink_color_types(cartridge_type,color_variation,created_by_account_id) VALUES(?,?,?) ON CONFLICT(lower(trim(cartridge_type)),lower(trim(color_variation))) DO NOTHING`,[input.cartridgeType,input.color,actor.accountId])
        await q.execute('UPDATE ink_repository SET cartridge_type=?,color_variation=?,updated_at=NOW() WHERE ink_id=?',[input.cartridgeType,input.color,id])
        await q.execute('INSERT INTO ink_stock_changes(ink_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[id,actor.accountId,JSON.stringify(before),JSON.stringify({...before,cartridge_type:input.cartridgeType,color_variation:input.color})])
        await q.commit();return {ink_id:id,cartridge_type:input.cartridgeType,color_variation:input.color}
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
    async remove(actor:Actor,value:unknown){
      const id=Number(value)
      if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'INK_STOCK_INVALID','Choose a saved ink item.')
      const q=await database.getConnection()
      try{
        await q.beginTransaction();await requireLibraryActor(q,actor.accountId!,'library.manage')
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM ink_repository WHERE ink_id=? FOR UPDATE',[id])
        const before=rows[0]
        if(!before)throw new HttpError(404,'INK_STOCK_NOT_FOUND','The ink stock item was not found.')
        if(before.deleted_at){await q.commit();return {ink_id:id,deleted:true}}
        if(Number(before.available_bottles)!==0)throw new HttpError(409,'INK_HAS_STOCK','Use or correct the remaining stock before deleting this ink item.')
        await q.execute('UPDATE ink_repository SET deleted_at=NOW(),updated_at=NOW() WHERE ink_id=?',[id])
        await q.execute('INSERT INTO ink_stock_changes(ink_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[id,actor.accountId,JSON.stringify(before),JSON.stringify({deleted:true})])
        await q.commit();return {ink_id:id,deleted:true}
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
  }
}
export const inkStockService=createInkStockService()
