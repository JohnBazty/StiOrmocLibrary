import type {PoolConnection,RowDataPacket} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'

export function paperBrand(value:unknown){
  const brand=String(value??'').trim().replace(/ +/g,' ')
  if(!brand||brand.length>100||/[\u0000-\u001f\u007f]/.test(brand))throw new HttpError(422,'PAPER_BRAND_INVALID','Enter the paper brand, up to 100 characters.')
  return brand
}

/** Caller locks the parent size first, keeping brand and total quantities atomic. */
export async function addPaperBrandStock(q:PoolConnection,id:number,brand:string,quantity:number,cost:number){
  await q.execute(`INSERT INTO paper_brand_stocks(paper_stock_id,brand,monochrome_price,colored_price)
    SELECT p.paper_stock_id,?,
      (SELECT price_per_page FROM print_pricing_rules WHERE paper_size=p.paper_size_dimension AND print_type='Monochrome'),
      (SELECT price_per_page FROM print_pricing_rules WHERE paper_size=p.paper_size_dimension AND print_type='Colored')
    FROM bond_paper_stocks p WHERE p.paper_stock_id=?
    ON CONFLICT(paper_stock_id,lower(trim(brand))) DO UPDATE SET deleted_at=NULL`,[brand,id])
  const [stock]=await q.execute<RowDataPacket[]>('SELECT * FROM paper_brand_stocks WHERE paper_stock_id=? AND lower(trim(brand))=lower(?) FOR UPDATE',[id,brand])
  const item=stock[0],before=Number(item.unopened_reams),after=before+quantity
  const average=Number(((before*Number(item.average_expense_cost)+quantity*cost)/after).toFixed(2))
  await q.execute('UPDATE paper_brand_stocks SET unopened_reams=?,average_expense_cost=?,updated_at=NOW() WHERE paper_brand_stock_id=?',[after,average,item.paper_brand_stock_id])
  return Number(item.paper_brand_stock_id)
}

export async function adjustPaperBrandStock(q:PoolConnection,id:number,brandId:unknown,delta:number){
  const value=brandId==null?null:Number(brandId)
  if(value!==null&&(!Number.isSafeInteger(value)||value<1))throw new HttpError(422,'PAPER_BRAND_INVALID','Choose a paper brand.')
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM paper_brand_stocks WHERE paper_stock_id=? AND deleted_at IS NULL
    ${value===null?(delta<0?'AND unopened_reams>0':''):'AND paper_brand_stock_id=?'} ORDER BY paper_brand_stock_id FOR UPDATE`,value===null?[id]:[id,value])
  if(rows.length!==1)throw new HttpError(422,'PAPER_BRAND_REQUIRED','Choose the paper brand to update.')
  const row=rows[0],next=Number(row.unopened_reams)+delta
  if(next<0)throw new HttpError(409,'PAPER_STOCK_INSUFFICIENT','This paper brand does not have enough unopened reams.')
  await q.execute('UPDATE paper_brand_stocks SET unopened_reams=?,updated_at=NOW() WHERE paper_brand_stock_id=?',[next,row.paper_brand_stock_id])
  return Number(row.paper_brand_stock_id)
}
