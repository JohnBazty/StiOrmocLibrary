import type { ResultSetHeader,RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { maintenanceStore,audit } from './maintenance-store.ts'
import { choice,id,invalid,itemInput,number,text,type ItemKind } from './maintenance-validation.ts'
const conflict=()=>new HttpError(409,'STOCK_CHANGED','This record changed. Reload and review the current details before saving.')
export function createStockItemsService(store=maintenanceStore){
  return {
    list:(actor:number,kind:ItemKind,search='')=>store.read(actor,async q=>{
      const [items]=await q.execute<RowDataPacket[]>(`SELECT i.*,c.name category FROM maintained_stock_items i JOIN maintained_item_categories c ON c.category_id=i.category_id WHERE i.kind=? AND strpos(lower(CONCAT_WS(' ',i.name,c.name,i.specifications)),lower(?))>0 ORDER BY i.state,i.name,i.item_id LIMIT 1000`,[kind,text(search,'Search',150)])
      const [categories]=await q.execute<RowDataPacket[]>('SELECT * FROM maintained_item_categories WHERE kind=? ORDER BY state,name,category_id',[kind]);return {items,categories}
    }),
    category:(actor:number,kind:ItemKind,body:Record<string,unknown>,value?:unknown)=>{
      const categoryId=value==null?null:id(value),name=text(body.name,'Category name',100,true),state=choice(body.state??'Active',['Active','Archived'],'category status')
      return store.write(actor,body.commandKey,{kind,categoryId,name,state,version:body.version},async q=>{
        let before:RowDataPacket|null=null
        if(categoryId){const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM maintained_item_categories WHERE category_id=? AND kind=? FOR UPDATE',[categoryId,kind]);before=rows[0];if(!before)throw invalid('Category was not found.');if(Number(before.version)!==Number(body.version))throw conflict()}
        const [duplicate]=await q.execute<RowDataPacket[]>('SELECT category_id FROM maintained_item_categories WHERE kind=? AND lower(name)=lower(?) AND category_id<>?',[kind,name,categoryId??0]);if(duplicate.length)throw invalid('This category name already exists.')
        let savedId=categoryId
        if(categoryId)await q.execute('UPDATE maintained_item_categories SET name=?,state=?,version=version+1,updated_by=?,updated_at=now() WHERE category_id=?',[name,state,actor,categoryId])
        else{const [result]=await q.execute<ResultSetHeader>('INSERT INTO maintained_item_categories(kind,name,state,updated_by) VALUES (?,?,?,?)',[kind,name,state,actor]);savedId=Number(result.insertId)}
        await audit(q,actor,`${kind}-category`,savedId!,'Category details',before,{name,state});return {categoryId:savedId}
      })
    },
    save:(actor:number,kind:ItemKind,body:Record<string,unknown>,value?:unknown)=>{
      const itemId=value==null?null:id(value),input=itemInput(body),opening=itemId?0:number(body.opening??0,'opening quantity',99999999,input.unit==='metres'?3:0)
      return store.write(actor,body.commandKey,{kind,itemId,input,opening,version:body.version},async q=>{
        let before:RowDataPacket|null=null
        if(itemId){const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM maintained_stock_items WHERE item_id=? AND kind=? FOR UPDATE',[itemId,kind]);before=rows[0];if(!before)throw invalid('Item was not found.');if(Number(before.version)!==Number(body.version))throw conflict();if(before.unit!==input.unit)throw invalid('Keep the recorded stock unit. Create a separate item for a different unit.')}
        const [categories]=await q.execute<RowDataPacket[]>('SELECT state FROM maintained_item_categories WHERE category_id=? AND kind=? FOR SHARE',[input.categoryId,kind]);if(!categories.length||categories[0].state!=='Active'&&(!before||Number(before.category_id)!==input.categoryId))throw invalid('Choose an active category.')
        let savedId=itemId
        if(itemId)await q.execute('UPDATE maintained_stock_items SET name=?,category_id=?,specifications=?,price=?,threshold=?,state=?,version=version+1,updated_by=?,updated_at=now() WHERE item_id=?',[input.name,input.categoryId,input.specifications,input.price,input.threshold,input.state,actor,itemId])
        else {if(input.state!=='Active')throw invalid('New items must be active.');const [result]=await q.execute<ResultSetHeader>('INSERT INTO maintained_stock_items(kind,name,category_id,specifications,unit,price,threshold,balance,updated_by) VALUES (?,?,?,?,?,?,?,?,?)',[kind,input.name,input.categoryId,input.specifications,input.unit,input.price,input.threshold,opening,actor]);savedId=Number(result.insertId)
          await q.execute(`INSERT INTO maintained_stock_movements(item_id,action,quantity,balance_before,balance_after,item_name,unit,reason,actor_id) VALUES (?,'Opening',?,0,?,?,?,'Opening stock',?)`,[savedId,opening,opening,input.name,input.unit,actor])}
        await audit(q,actor,`${kind}-item`,savedId!,'Item details',before,input);return {itemId:savedId}
      })
    },
    movement:(actor:number,kind:ItemKind,value:unknown,body:Record<string,unknown>)=>{
      const itemId=id(value),action=choice(body.action,['Restock','Use','Correction'],'a stock action'),reason=text(body.reason,'Stock change reason',500,true)
      return store.write(actor,body.commandKey,{kind,itemId,action,quantity:body.quantity,unitCost:body.unitCost,reason,version:body.version},async q=>{
        const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM maintained_stock_items WHERE item_id=? AND kind=? FOR UPDATE',[itemId,kind]),item=rows[0]
        if(!item)throw invalid('Item was not found.');if(item.state!=='Active')throw invalid('Restore the archived item before changing its stock.');if(Number(item.version)!==Number(body.version))throw conflict()
        const quantity=number(body.quantity,action==='Correction'?'correct stock balance':'quantity',99999999,item.unit==='metres'?3:0)
        if(action!=='Correction'&&quantity===0)throw invalid('Quantity must be greater than zero.')
        const before=Number(item.balance),delta=action==='Correction'?quantity-before:action==='Use'?-quantity:quantity,after=Number((before+delta).toFixed(3))
        if(after<0)throw invalid('There is not enough stock for this change.')
        const unitCost=action==='Restock'?number(body.unitCost??0,'actual unit cost'):0,expense=action==='Restock'&&kind==='printing'?Number((quantity*unitCost).toFixed(2)):0
        await q.execute('UPDATE maintained_stock_items SET balance=?,version=version+1,updated_by=?,updated_at=now() WHERE item_id=?',[after,actor,itemId])
        const [result]=await q.execute<ResultSetHeader>('INSERT INTO maintained_stock_movements(item_id,action,quantity,balance_before,balance_after,unit_cost,expense,item_name,unit,reason,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[itemId,action,delta,before,after,unitCost,expense,item.name,item.unit,reason,actor])
        return {movementId:Number(result.insertId),balanceBefore:before,balanceAfter:after}
      })
    },
    history:(actor:number,kind:ItemKind,value:unknown)=>store.read(actor,async q=>{
      const itemId=id(value),[items]=await q.execute<RowDataPacket[]>('SELECT item_id FROM maintained_stock_items WHERE item_id=? AND kind=?',[itemId,kind]);if(!items.length)throw invalid('Item was not found.')
      const [movements]=await q.execute<RowDataPacket[]>('SELECT m.*,u.full_name actor FROM maintained_stock_movements m JOIN accounts a ON a.account_id=m.actor_id LEFT JOIN users u ON u.user_id=a.user_id WHERE m.item_id=? ORDER BY m.movement_id DESC LIMIT 200',[itemId])
      const [events]=await q.execute<RowDataPacket[]>('SELECT e.* FROM library_maintenance_events e WHERE scope=? AND record_id=? ORDER BY event_id DESC LIMIT 200',[`${kind}-item`,itemId]);return {movements,events}
    }),
  }
}
export const stockItemsService=createStockItemsService()
