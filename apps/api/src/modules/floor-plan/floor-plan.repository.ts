import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { validateLayout, type Layout } from './floor-plan.validation.ts'

export function createFloorPlanRepository(database: Pool = db) {
  const parse=(value:string)=>JSON.parse(value) as Layout
  async function event(c:PoolConnection,actor:number,type:string,details:unknown){await c.execute('INSERT INTO floor_plan_events (account_id,event_type,details) VALUES (?,?,?)',[actor,type,JSON.stringify(details)])}
  async function locked<T>(action:(c:PoolConnection,row:RowDataPacket)=>Promise<T>){
    const c=await database.getConnection()
    try {await c.beginTransaction();const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM floor_plan_state WHERE id=1 FOR UPDATE');if(!rows[0])throw new HttpError(503,'FLOOR_PLAN_SETUP','Apply the floor plan migration.');const result=await action(c,rows[0]);await c.commit();return result}
    catch(e){await c.rollback();throw e}finally{c.release()}
  }
  async function shelves(executor:Pool|PoolConnection){
    const [rows]=await executor.execute<RowDataPacket[]>(`SELECT s.id,s.label,s.column_count,s.row_count,
      (SELECT COUNT(*) FROM physical_copies pc WHERE pc.shelf_location=s.label AND pc.lifecycle_status='Active') bookCount,
      (SELECT COUNT(*) FROM research_inventory ri WHERE ri.shelf_location=s.label AND ri.lifecycle_status='Active') researchCount
      FROM floor_plan_shelves s ORDER BY s.label`)
    return rows.map(r=>({id:Number(r.id),label:String(r.label),columnCount:Number(r.column_count),rowCount:Number(r.row_count),bookCount:Number(r.bookCount),researchCount:Number(r.researchCount)}))
  }
  async function validateShelves(c:PoolConnection,layout:Layout){
    const known=await shelves(c)
    for(const o of layout.objects.filter(o=>o.shelfId))if(!known.some(s=>s.id===o.shelfId))throw new HttpError(422,'SHELF_MISSING','A shelf no longer exists. Reload the editor.')
    const names=new Set<string>()
    for(const o of layout.objects.filter(o=>o.shelfId)){const name=o.label.toLowerCase();if(names.has(name)||known.some(s=>s.id!==o.shelfId&&s.label.toLowerCase()===name))throw new HttpError(422,'SHELF_LABEL_DUPLICATE','Use a unique shelf label.');names.add(name)}
    return known
  }
  return {
    async state(editor=false){
      const [rows]=await database.execute<RowDataPacket[]>('SELECT * FROM floor_plan_state WHERE id=1')
      const row=rows[0]; if(!row)throw new HttpError(503,'FLOOR_PLAN_SETUP','Apply the floor plan migration.')
      const [categories]=await database.execute<RowDataPacket[]>('SELECT category_id id,category_name name FROM categories ORDER BY category_name')
      return {revision:Number(row.revision),layout:editor?parse(row.draft):row.published?parse(row.published):null,published:editor&&row.published?parse(row.published):null,shelves:await shelves(database),categories:categories.map(r=>({id:Number(r.id),name:String(r.name)})),updatedAt:row.updated_at}
    },
    async save(actor:number,revision:number,layout:Layout,publish=false){return locked(async(c,row)=>{
      if(Number(row.revision)!==revision)throw new HttpError(409,'FLOOR_PLAN_CONFLICT','Another change was saved. Reload before editing again.')
      const known=await validateShelves(c,layout)
      if(publish){
        const previous:Layout=row.published?parse(row.published):{areas:[],objects:[]}
        for(const old of previous.objects.filter(o=>o.shelfId)){
          const shelf=known.find(s=>s.id===old.shelfId)
          if(shelf&&(shelf.bookCount+shelf.researchCount)>0&&!layout.objects.some(o=>o.shelfId===shelf.id))throw new HttpError(422,'SHELF_OCCUPIED',`Transfer the books and research on ${shelf.label} before removing this shelf from the map.`)
        }
        for(const o of layout.objects.filter(o=>o.shelfId)){
          const old=known.find(s=>s.id===o.shelfId)!
          if(old.label!==o.label){
            await c.execute('UPDATE floor_plan_shelves SET label=?,updated_at=NOW() WHERE id=?',[o.label,o.shelfId])
            for(const table of ['physical_copies','materials','research_inventory','categories'])await c.execute(`UPDATE ${table} SET shelf_location=? WHERE shelf_location=?`,[o.label,old.label])
          }
        }
        await c.execute('INSERT INTO floor_plan_versions (layout,published_by_account_id) VALUES (?,?)',[JSON.stringify(layout),actor])
        await c.execute('UPDATE floor_plan_state SET draft=?,published=?,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(layout),JSON.stringify(layout)])
      } else await c.execute('UPDATE floor_plan_state SET draft=?,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(layout)])
      await event(c,actor,publish?'Published':'Draft saved',{revision:revision+1})
      return {revision:revision+1}
    })},
    async versions(){const [rows]=await database.execute<RowDataPacket[]>(`SELECT v.id,v.created_at createdAt,a.school_id publishedBy FROM floor_plan_versions v JOIN accounts a ON a.account_id=v.published_by_account_id ORDER BY v.id DESC LIMIT 100`);return rows},
    async restore(actor:number,id:number,revision:number){return locked(async(c,row)=>{
      if(Number(row.revision)!==revision)throw new HttpError(409,'FLOOR_PLAN_CONFLICT','Reload before restoring this layout.')
      const [versions]=await c.execute<RowDataPacket[]>('SELECT layout FROM floor_plan_versions WHERE id=?',[id]);if(!versions[0])throw new HttpError(404,'LAYOUT_NOT_FOUND','Layout version not found.')
      const layout=validateLayout(parse(versions[0].layout))
      // Keep current labels and assignments when recovering old geometry.
      const current=await shelves(c);for(const o of layout.objects){if(o.shelfId){const s=current.find(s=>s.id===o.shelfId);if(s)o.label=s.label}}
      await c.execute('UPDATE floor_plan_state SET draft=?,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(layout)])
      await event(c,actor,'Restored draft',{versionId:id});return {revision:revision+1}
    })},
    async addShelf(actor:number,label:string){return locked(async(c)=>{
      const [existing]=await c.execute<RowDataPacket[]>('SELECT id FROM floor_plan_shelves WHERE label=?',[label]);if(existing.length)throw new HttpError(409,'SHELF_EXISTS','This shelf already exists. Select it from Unplaced shelves.')
      const [result]=await c.execute<ResultSetHeader>('INSERT INTO floor_plan_shelves (label,column_count,row_count) VALUES (?,3,5)',[label]);await event(c,actor,'Shelf created',{id:result.insertId,label,columnCount:3,rowCount:5});return {id:result.insertId,label,columnCount:3,rowCount:5}
    })},
    async updateGrid(actor:number,shelfId:number,columnCount:number,rowCount:number){return locked(async(c)=>{
      const [targets]=await c.execute<RowDataPacket[]>('SELECT id,label,column_count,row_count FROM floor_plan_shelves WHERE id=? LIMIT 1 FOR UPDATE',[shelfId])
      const target=targets[0];if(!target)throw new HttpError(404,'SHELF_MISSING','Select an existing shelf.')
      const [occupied]=await c.execute<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM categories WHERE shelf_location=? AND (shelf_column>? OR shelf_row>?)) categoryCount,
        (SELECT COUNT(*) FROM physical_copies WHERE shelf_location=? AND lifecycle_status='Active' AND (shelf_column>? OR shelf_row>?)) bookCount,
        (SELECT COUNT(*) FROM research_inventory WHERE shelf_location=? AND lifecycle_status='Active' AND (shelf_column>? OR shelf_row>?)) researchCount`,
        [target.label,columnCount,rowCount,target.label,columnCount,rowCount,target.label,columnCount,rowCount])
      const blocked={categories:Number(occupied[0]?.categoryCount??0),books:Number(occupied[0]?.bookCount??0),research:Number(occupied[0]?.researchCount??0)}
      if(blocked.categories+blocked.books+blocked.research>0)throw new HttpError(422,'SHELF_GRID_OCCUPIED','Move the assignments outside the rows or columns being removed before making this shelf smaller.',blocked)
      await c.execute('UPDATE floor_plan_shelves SET column_count=?,row_count=?,updated_at=NOW() WHERE id=?',[columnCount,rowCount,shelfId])
      await event(c,actor,'Shelf grid changed',{shelfId,label:target.label,from:{columnCount:Number(target.column_count),rowCount:Number(target.row_count)},to:{columnCount,rowCount}})
      return {id:shelfId,label:String(target.label),columnCount,rowCount}
    })},
    async transfer(actor:number,copyIds:number[],shelfId:number,shelfColumn=1,shelfRow=1){return locked(async(c)=>{
      const [target]=await c.execute<RowDataPacket[]>('SELECT label,column_count,row_count FROM floor_plan_shelves WHERE id=?',[shelfId]);if(!target[0])throw new HttpError(404,'SHELF_MISSING','Select an existing shelf.')
      if(shelfColumn>Number(target[0].column_count)||shelfRow>Number(target[0].row_count))throw new HttpError(422,'SHELF_POSITION_INVALID','Choose a column and row that exist on the selected shelf.')
      const marks=copyIds.map(()=>'?').join(',')
      const [copies]=await c.execute<RowDataPacket[]>(`SELECT pc.physical_copy_id,pc.material_id,pc.shelf_location,c.shelf_location category_shelf
        FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id LEFT JOIN categories c ON c.category_id=t.category_id
        WHERE pc.physical_copy_id IN (${marks}) AND pc.lifecycle_status='Active' FOR UPDATE`,copyIds)
      if(copies.length!==copyIds.length)throw new HttpError(422,'COPY_MISSING','Some selected copies no longer exist.')
      if(copies.some(copy=>copy.category_shelf!==target[0].label))throw new HttpError(422,'CATEGORY_SHELF_CONFLICT','Move the book category to this shelf in Category Management. All copies in one category must share its shelf.')
      for(const copy of copies){await c.execute('UPDATE physical_copies SET shelf_location=?,shelf_column=?,shelf_row=?,row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?',[target[0].label,shelfColumn,shelfRow,copy.physical_copy_id]);if(copy.material_id)await c.execute('UPDATE materials SET shelf_location=? WHERE material_id=?',[target[0].label,copy.material_id])}
      await event(c,actor,'Copies transferred',{shelfId,to:target[0].label,shelfColumn,shelfRow,copies});return {count:copies.length,shelfColumn,shelfRow}
    })},
    async locations(){const [rows]=await database.execute<RowDataPacket[]>(`SELECT label FROM floor_plan_shelves UNION SELECT shelf_location label FROM categories WHERE shelf_location<>'' ORDER BY label`);return rows.map(r=>String(r.label))},
    async books(query:Record<string,unknown>){
      const clauses=["pc.lifecycle_status='Active'","t.lifecycle_status='Active'","t.record_type='Book'"],params:(string|number)[]=[]
      const q=String(query.q??'').trim().slice(0,150)
      if(q){clauses.push('(t.title LIKE ? OR t.isbn LIKE ? OR s.label LIKE ? OR pc.shelf_location LIKE ? OR EXISTS (SELECT 1 FROM authors a WHERE a.title_id=t.title_id AND a.author_name LIKE ?))');params.push(...Array(5).fill(`%${q}%`))}
      for(const [key,col] of [['titleId','t.title_id'],['shelfId','s.id'],['categoryId','t.category_id'],['copyId','pc.physical_copy_id']])if(query[key]){const id=Number(query[key]);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'FILTER_INVALID','Invalid map filter.');clauses.push(`${col}=?`);params.push(id)}
      if(query.barcode){clauses.push('pc.barcode=?');params.push(String(query.barcode).slice(0,100))}
      if(query.available==='true')clauses.push("pc.availability_status='Available'")
      if(query.unmapped==='true')clauses.push('s.id IS NULL')
      const joins=`FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id LEFT JOIN categories cat ON cat.category_id=t.category_id LEFT JOIN floor_plan_shelves s ON s.label=pc.shelf_location WHERE ${clauses.join(' AND ')}`
      const [[items],[matches]]=await Promise.all([
        database.execute<RowDataPacket[]>(`SELECT pc.physical_copy_id copyId,t.title_id titleId,t.title,t.isbn,t.call_number callNumber,t.cover_image_path coverPath,cat.category_name categoryName,t.category_id categoryId,pc.barcode,pc.shelf_location shelfLabel,pc.shelf_column shelfColumn,pc.shelf_row shelfRow,s.id shelfId,s.column_count shelfColumnCount,s.row_count shelfRowCount,pc.availability_status availability,(SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ') FROM authors a WHERE a.title_id=t.title_id) author ${joins} ORDER BY pc.shelf_row,pc.shelf_column,t.call_number,t.title,pc.physical_copy_id LIMIT 100`,params),
        database.execute<RowDataPacket[]>(`SELECT s.id shelfId,COUNT(*) count ${joins} GROUP BY s.id`,params)
      ])
      return {items,matches,total:matches.reduce((sum,r)=>sum+Number(r.count),0)}
    }
  }
}
export const floorPlanRepository=createFloorPlanRepository()
