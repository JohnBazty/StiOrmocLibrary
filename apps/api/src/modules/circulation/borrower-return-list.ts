import type {PoolConnection,RowDataPacket} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'

export function returnListPage(value:unknown){const page=value===undefined?1:Number(value);if(!Number.isSafeInteger(page)||page<1||page>10000)throw new HttpError(422,'RETURN_PAGE_INVALID','Choose a valid loan page.');return page}
/** Copy/loan identity is retained; never resolve a return by title or shared ISBN. */
export async function borrowerReturnList(q:Pick<PoolConnection,'execute'>,userId:number,page=1){
 const [rows]=await q.execute<RowDataPacket[]>(`SELECT bt.transaction_id AS id,'TakeHome' AS kind,COALESCE(t.title,m.title) AS title,
   COALESCE(pc.barcode,m.barcode) AS barcode,to_char(bt.borrowed_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00' AS borrowed_at,
   to_char(bt.due_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00' AS due_at,bt.transaction_status AS status,t.cover_image_path AS cover
   FROM borrow_transactions bt LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
   LEFT JOIN titles t ON t.title_id=pc.title_id LEFT JOIN materials m ON m.material_id=bt.material_id
   WHERE bt.user_id=? AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.returned_at IS NULL
   ORDER BY bt.due_at,bt.transaction_id LIMIT 51 OFFSET ?`,[userId,(page-1)*50])
 return {rows:rows.slice(0,50).map(r=>({id:Number(r.id),kind:'TakeHome' as const,title:String(r.title??'Book'),barcode:r.barcode?String(r.barcode):null,borrowedAt:r.borrowed_at,dueAt:r.due_at,status:r.status,cover:r.cover??null})),page,more:rows.length>50}
}
