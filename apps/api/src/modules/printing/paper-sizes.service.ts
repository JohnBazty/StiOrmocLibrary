import {addPaperBrandStock,paperBrand} from './paper-brands.ts'
import { randomUUID } from 'node:crypto'
import { db,type Pool,type PoolConnection,type RowDataPacket,type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { parsePaperSize,paperSizeName } from './paper-sizes.validation.ts'
import { parseRestock } from './printing.validation.ts'

type Actor={accountId?:number}
type Reader=Pick<Pool,'execute'>
const sizeId=(value:unknown)=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'PAPER_SIZE_INVALID','Choose a saved paper size.');return id}
const conflict=()=>new HttpError(409,'PAPER_SIZE_CHANGED','This paper size changed. Refresh the list and review it again.')
const sizeSql=`SELECT p.*,(SELECT json_agg(b ORDER BY b.brand) FROM paper_brand_stocks b WHERE b.paper_stock_id=p.paper_stock_id AND b.deleted_at IS NULL) brands,d.width,d.height,d.dimension_unit,
  (SELECT price_per_page FROM print_pricing_rules WHERE paper_size=p.paper_size_dimension AND print_type='Monochrome') monochrome_price,
  (SELECT price_per_page FROM print_pricing_rules WHERE paper_size=p.paper_size_dimension AND print_type='Colored') colored_price
  FROM bond_paper_stocks p LEFT JOIN print_supply_details d ON d.paper_stock_id=p.paper_stock_id`

export function createPaperSizesService(database:Pool=db) {
  async function authorize(q:Reader,actor:Actor) {
    if(!Number.isSafeInteger(actor.accountId)||actor.accountId!<1)throw new HttpError(401,'PRINT_AUTH_REQUIRED','Sign in before managing paper sizes.')
    await requireLibraryActor(q,actor.accountId!,'library.manage')
    const [rows]=await q.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actor.accountId])
    if(!rows[0]?.user_id)throw new HttpError(403,'PRINT_ACCOUNT_BLOCKED','Your library account is not linked to a staff profile.')
    return Number(rows[0].user_id)
  }
  async function read(q:Reader,id:number) {const [rows]=await q.execute<RowDataPacket[]>(`${sizeSql} WHERE p.paper_stock_id=?`,[id]);return rows[0]}
  async function restock(q:PoolConnection,id:number,staffId:number,quantity:number,unitCost:number,key:string,brand?:string) {
    const [stock]=await q.execute<RowDataPacket[]>('SELECT unopened_reams,average_expense_cost FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE',[id])
    if(!stock[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper size was not found.')
    const [prior]=await q.execute<RowDataPacket[]>('SELECT paper_stock_id,paper_brand_stock_id,quantity_reams,unit_cost_per_ream,recorded_by_user_id,balance_after,(SELECT brand FROM paper_brand_stocks WHERE paper_brand_stock_id=paper_stock_movements.paper_brand_stock_id) brand FROM paper_stock_movements WHERE client_request_id=?',[key])
    if(prior[0]){
      if((brand&&String(prior[0].brand).toLowerCase()!==brand.toLowerCase())||Number(prior[0].paper_stock_id)!==id||Number(prior[0].quantity_reams)!==quantity||Number(prior[0].unit_cost_per_ream)!==unitCost||Number(prior[0].recorded_by_user_id)!==staffId)throw new HttpError(409,'PAPER_RESTOCK_CHANGED','This stock entry was already used. Start a new stock entry.')
      return {paper_stock_id:id,paper_brand_stock_id:Number(prior[0].paper_brand_stock_id),unopened_reams:Number(stock[0].unopened_reams),already_recorded:true}
    }
    const before=Number(stock[0].unopened_reams),after=before+quantity,expense=Number((quantity*unitCost).toFixed(2))
    if(after>999999||expense>9999999999.99)throw new HttpError(422,'PAPER_STOCK_LIMIT','The stock quantity or total expense is too large. Review the entry.')
    const average=Number(((before*Number(stock[0].average_expense_cost)+expense)/after).toFixed(2))
    await q.execute('UPDATE bond_paper_stocks SET unopened_reams=?,remaining_reams=?,average_expense_cost=?,updated_at=NOW() WHERE paper_stock_id=?',[after,after,average,id])
    const brandId=await addPaperBrandStock(q,id,brand??'Unspecified brand',quantity,unitCost)
    await q.execute(`INSERT INTO paper_stock_movements(paper_stock_id,movement_type,activity_code,quantity_reams,unit_cost_per_ream,expense_amount,balance_before,balance_after,recorded_by_user_id,client_request_id,paper_brand_stock_id)
      VALUES (?,'Restock','Restock',?,?,?,?,?,?,?,?)`,[id,quantity,unitCost,expense,before,after,staffId,key,brandId])
    await q.execute('INSERT INTO paper_replenishments(paper_stock_id,recorded_by_user_id,replenishment_date,quantity_added_reams,expense_cost) VALUES (?,?,NOW(),?,?)',[id,staffId,quantity,expense])
    return {paper_stock_id:id,paper_brand_stock_id:brandId,unopened_reams:after,total_expense:expense,already_recorded:false}
  }
  return {
    async list(actor:Actor){await authorize(database,actor);const [rows]=await database.execute<RowDataPacket[]>(`${sizeSql} WHERE p.deleted_at IS NULL ORDER BY p.paper_size_dimension`);return rows},
    async saveDefinition(actor:Actor,idValue:unknown,body:Record<string,unknown>){
      if(Object.keys(body).some(key=>!['name','width','height','configuration_version'].includes(key)))throw new HttpError(422,'PAPER_DEFINITION_INVALID','Use Add paper stock to set quantities, alerts and printing prices.')
      const creating=idValue==null,input=parsePaperSize({...body,monochrome_price:1,colored_price:1},creating),requestedName=body.name==null?null:paperSizeName(body.name),q=await database.getConnection()
      let id=creating?null:sizeId(idValue)
      try{
        await q.beginTransaction();await authorize(q,actor)
        let before:RowDataPacket|null=null
        if(creating){
          // Reuse a removed zero-stock definition so historical names stay unique.
          const [existing]=await q.execute<RowDataPacket[]>('SELECT * FROM bond_paper_stocks WHERE lower(trim(paper_size_dimension))=lower(?) FOR UPDATE',[input.name])
          if(existing[0]){
            before=existing[0]
            if(!before.deleted_at)throw new HttpError(409,'PAPER_SIZE_EXISTS','That paper size already exists.')
            if(Number(before.unopened_reams)!==0||Number(before.remaining_reams)!==0)throw new HttpError(409,'PAPER_HAS_STOCK','This paper size still has stock.')
            id=Number(before.paper_stock_id)
            await q.execute('UPDATE bond_paper_stocks SET deleted_at=NULL,is_active=FALSE,configuration_version=configuration_version+1,updated_at=NOW() WHERE paper_stock_id=?',[id])
          }else{
            const [result]=await q.execute<ResultSetHeader>(`INSERT INTO bond_paper_stocks(paper_size_dimension,unopened_reams,remaining_reams,average_expense_cost,low_stock_threshold_reams,is_active,sheets_per_ream) VALUES(?,0,0,0,2,FALSE,500)`,[input.name]);id=Number(result.insertId)
          }
        }else{
          const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE',[id])
          if(!rows[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper size was not found.')
          before=rows[0];if(Number(before.configuration_version)!==input.version)throw conflict()
          if(requestedName!==null&&requestedName!==before.paper_size_dimension){
            const [duplicates]=await q.execute<RowDataPacket[]>('SELECT paper_stock_id FROM bond_paper_stocks WHERE lower(trim(paper_size_dimension))=lower(?) AND paper_stock_id<>?',[requestedName,id])
            if(duplicates[0])throw new HttpError(409,'PAPER_SIZE_EXISTS','That paper size name already exists.')
            const [jobs]=await q.execute<RowDataPacket[]>("SELECT request_id FROM print_requests WHERE paper_size=? AND job_status NOT IN ('Completed','Cancelled') LIMIT 1",[before.paper_size_dimension])
            if(jobs[0])throw new HttpError(409,'PAPER_SIZE_IN_USE','Finish or cancel unfinished print jobs using this size before changing its name. You can still edit its dimensions.')
            await q.execute('UPDATE print_pricing_rules SET paper_size=?,updated_at=NOW() WHERE paper_size=?',[requestedName,before.paper_size_dimension])
            await q.execute('UPDATE bond_paper_stocks SET paper_size_dimension=? WHERE paper_stock_id=?',[requestedName,id])
          }
          await q.execute('UPDATE bond_paper_stocks SET configuration_version=configuration_version+1,updated_at=NOW() WHERE paper_stock_id=?',[id])
        }
        const name=String((!creating?requestedName:null)??before?.paper_size_dimension??input.name)
        await q.execute(`INSERT INTO print_supply_details(paper_stock_id,size_name,width,height,dimension_unit,updated_by) VALUES(?,?,?,?,?,?)
          ON CONFLICT(paper_stock_id) DO UPDATE SET size_name=EXCLUDED.size_name,width=EXCLUDED.width,height=EXCLUDED.height,dimension_unit=EXCLUDED.dimension_unit,version=print_supply_details.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[id,name,input.width,input.height,input.width===null?null:'mm',actor.accountId])
        const after=await read(q,id!)
        await q.execute('INSERT INTO paper_size_changes(paper_stock_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[id,actor.accountId,before?JSON.stringify(before):null,JSON.stringify(after)])
        await q.commit();return after
      }catch(error){await q.rollback();if((error as {code?:string}).code==='23505')throw new HttpError(409,'PAPER_SIZE_EXISTS','That paper size already exists.');throw error}finally{q.release()}
    },
    async remove(actor:Actor,idValue:unknown,version:unknown){
      const id=sizeId(idValue),q=await database.getConnection()
      try{
        await q.beginTransaction();await authorize(q,actor)
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM bond_paper_stocks WHERE paper_stock_id=? FOR UPDATE',[id]),before=rows[0]
        if(!before)throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper size was not found.')
        if(before.deleted_at){await q.commit();return {deleted:true}}
        if(Number(before.configuration_version)!==Number(version))throw conflict()
        await q.execute('UPDATE bond_paper_stocks SET deleted_at=NOW(),is_active=FALSE,configuration_version=configuration_version+1,updated_at=NOW() WHERE paper_stock_id=?',[id])
        await q.execute('UPDATE print_pricing_rules SET is_active=0,updated_at=NOW() WHERE paper_size=?',[before.paper_size_dimension])
        await q.execute('INSERT INTO paper_size_changes(paper_stock_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[id,actor.accountId,JSON.stringify(before),JSON.stringify(await read(q,id))])
        await q.commit();return {deleted:true}
      }catch(error){await q.rollback();throw error}finally{q.release()}
    },
    async save(actor:Actor,idValue:unknown,body:Record<string,unknown>){
      const creating=idValue==null,id=creating?null:sizeId(idValue),input=parsePaperSize(body,creating),q=await database.getConnection()
      try{
        await q.beginTransaction();const staffId=await authorize(q,actor)
        let before:RowDataPacket|null=null,paperId=id
        if(!creating){const [locked]=await q.execute<RowDataPacket[]>('SELECT configuration_version FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE',[id]);if(!locked[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper size was not found.');if(Number(locked[0].configuration_version)!==input.version)throw conflict();before=await read(q,id!)}
        if(creating){const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO bond_paper_stocks(paper_size_dimension,unopened_reams,remaining_reams,average_expense_cost,low_stock_threshold_reams,is_active,sheets_per_ream)
          VALUES (?,0,0,0,?,?,?)`,[input.name,input.threshold,input.active,input.sheets]);paperId=Number(insert.insertId)}
        else await q.execute(`UPDATE bond_paper_stocks SET low_stock_threshold_reams=?,is_active=?,sheets_per_ream=?,configuration_version=configuration_version+1,updated_at=NOW() WHERE paper_stock_id=?`,[input.threshold,input.active,input.sheets,paperId])
        const name=creating?input.name:String(before!.paper_size_dimension)
        await q.execute(`INSERT INTO print_supply_details(paper_stock_id,size_name,width,height,dimension_unit,updated_by) VALUES (?,?,?,?,?,?)
          ON CONFLICT(paper_stock_id) DO UPDATE SET size_name=EXCLUDED.size_name,width=EXCLUDED.width,height=EXCLUDED.height,dimension_unit=EXCLUDED.dimension_unit,version=print_supply_details.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
          [paperId,name,input.width,input.height,input.width===null?null:'mm',actor.accountId])
        for(const [type,amount] of [['Monochrome',input.monochrome],['Colored',input.colored]])await q.execute(`INSERT INTO print_pricing_rules(print_type,paper_size,price_per_page,is_active) VALUES (?,?,?,?)
          ON CONFLICT(print_type,paper_size) DO UPDATE SET price_per_page=EXCLUDED.price_per_page,is_active=EXCLUDED.is_active,updated_at=NOW()`,[type,name,amount,input.active?1:0])
        if(input.initial)await restock(q,paperId!,staffId,input.initial,input.unitCost,randomUUID())
        const after=await read(q,paperId!)
        await q.execute('INSERT INTO paper_size_changes(paper_stock_id,changed_by_account_id,before_values,after_values) VALUES (?,?,?::jsonb,?::jsonb)',[paperId,actor.accountId,before?JSON.stringify(before):null,JSON.stringify(after)])
        await q.commit();return after
      }catch(error){await q.rollback();if((error as {code?:string}).code==='23505')throw new HttpError(409,'PAPER_SIZE_EXISTS','That paper size already exists. Select it from the list to add stock.');throw error}finally{q.release()}
    },
    async addStock(actor:Actor,idValue:unknown,body:Record<string,unknown>){
      const id=sizeId(idValue),input=parseRestock(body,'reams'),key=String(body.client_request_id??randomUUID())
      if(!/^\d+(\.\d{1,2})?$/.test(String(body.unit_cost??'')))throw new HttpError(422,'PAPER_PRICE_INVALID','Enter a purchase price per ream with up to two decimal places.')
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))throw new HttpError(422,'PAPER_RESTOCK_INVALID','Start a new paper stock entry and try again.')
      const brand=body.brand==null?undefined:paperBrand(body.brand)
      const settings=body.settings==null?null:parsePaperSize(body.settings as Record<string,unknown>,false),q=await database.getConnection()
      try{
        await q.beginTransaction();const staffId=await authorize(q,actor)
        const [locked]=await q.execute<RowDataPacket[]>('SELECT * FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE',[id])
        if(!locked[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper size was not found.')
        const before=await read(q,id),result=await restock(q,id,staffId,input.quantity,input.unitCost,key,brand)
        if(settings&&!result.already_recorded){
          if(Number(before.configuration_version)!==settings.version)throw conflict()
          await q.execute('UPDATE bond_paper_stocks SET sheets_per_ream=?,low_stock_threshold_reams=?,is_active=?,configuration_version=configuration_version+1,updated_at=NOW() WHERE paper_stock_id=?',[settings.sheets,settings.threshold,settings.active,id])
          for(const [type,amount] of [['Monochrome',settings.monochrome],['Colored',settings.colored]])await q.execute(`INSERT INTO print_pricing_rules(print_type,paper_size,price_per_page,is_active) VALUES(?,?,?,?) ON CONFLICT(print_type,paper_size) DO UPDATE SET price_per_page=EXCLUDED.price_per_page,is_active=EXCLUDED.is_active,updated_at=NOW()`,[type,before.paper_size_dimension,amount,settings.active?1:0])
          await q.execute('UPDATE paper_brand_stocks SET monochrome_price=?,colored_price=?,updated_at=NOW() WHERE paper_brand_stock_id=? AND paper_stock_id=?',[settings.monochrome,settings.colored,result.paper_brand_stock_id,id])
          await q.execute('INSERT INTO paper_size_changes(paper_stock_id,changed_by_account_id,before_values,after_values) VALUES(?,?,?::jsonb,?::jsonb)',[id,actor.accountId,JSON.stringify(before),JSON.stringify(await read(q,id))])
        }
        await q.commit();return result
      }
      catch(error){await q.rollback();throw error}finally{q.release()}
    },
  }
}
export const paperSizesService=createPaperSizesService()
