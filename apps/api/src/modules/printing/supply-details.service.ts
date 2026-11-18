import type { ResultSetHeader,RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { maintenanceStore,audit } from '../inventory/maintenance-store.ts'
import { choice,id,invalid,number,text } from '../inventory/maintenance-validation.ts'
export function parseSupplyDetails(body:Record<string,unknown>,kind:'ink'|'paper'){
  const width=body.width==null||body.width===''?null:number(body.width,'width',10000,3),height=body.height==null||body.height===''?null:number(body.height,'height',10000,3)
  const dimensionUnit=width==null&&height==null?null:choice(body.dimensionUnit,['mm','cm','in'],'a measurement unit')
  if((width==null)!==(height==null)||width===0||height===0)throw invalid('Enter both positive dimensions, or leave both blank.')
  if(kind==='ink'&&(width!=null||height!=null))throw invalid('Dimensions apply to paper only.')
  return {brand:text(body.brand,'Brand',100),typeModel:text(body.typeModel,'Type / model',100),compatiblePrinter:text(body.compatiblePrinter,'Compatible printer',150),paperType:text(body.paperType,'Paper type',100),sizeName:text(body.sizeName,'Size name',100),width,height,dimensionUnit,threshold:number(body.threshold,'low-stock threshold',1000000,kind==='ink'?0:2)}
}
export function createSupplyDetailsService(store=maintenanceStore){return {
  list:(actor:number)=>store.read(actor,async q=>{
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT 'ink' kind,i.ink_id id,CONCAT(i.cartridge_type,' · ',i.color_variation) name,i.available_bottles balance,'bottles' unit,i.low_stock_threshold_bottles threshold,d.* FROM ink_repository i LEFT JOIN print_supply_details d ON d.ink_id=i.ink_id
      UNION ALL SELECT 'paper',p.paper_stock_id,p.paper_size_dimension,p.unopened_reams,'reams',p.low_stock_threshold_reams,d.* FROM bond_paper_stocks p LEFT JOIN print_supply_details d ON d.paper_stock_id=p.paper_stock_id ORDER BY kind,id`)
    return rows.map(r=>({...r,version:r.version??0}))
  }),
  save:(actor:number,kindValue:unknown,value:unknown,body:Record<string,unknown>)=>{
    const kind=choice(kindValue,['ink','paper'],'a supply type'),supplyId=id(value),input=parseSupplyDetails(body,kind)
    return store.write(actor,body.commandKey,{kind,supplyId,input,version:body.version},async q=>{
      const table=kind==='ink'?'ink_repository':'bond_paper_stocks',key=kind==='ink'?'ink_id':'paper_stock_id',threshold=kind==='ink'?'low_stock_threshold_bottles':'low_stock_threshold_reams'
      const [supplies]=await q.execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE ${key}=? FOR UPDATE`,[supplyId]);if(!supplies.length)throw invalid('Supply was not found.')
      const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM print_supply_details WHERE ${key}=?`,[supplyId]),before=rows[0]??null
      if(Number(before?.version??0)!==Number(body.version))throw new HttpError(409,'SUPPLY_CHANGED','Supply details changed. Reload before saving.')
      const fields=[input.brand||null,input.typeModel||null,input.compatiblePrinter||null,input.paperType||null,input.sizeName||null,input.width,input.height,input.dimensionUnit,actor]
      let detailId=Number(before?.detail_id)
      if(before)await q.execute('UPDATE print_supply_details SET brand=?,type_model=?,compatible_printer=?,paper_type=?,size_name=?,width=?,height=?,dimension_unit=?,updated_by=?,updated_at=now(),version=version+1 WHERE detail_id=?',[...fields,detailId])
      else {const [result]=await q.execute<ResultSetHeader>(`INSERT INTO print_supply_details(brand,type_model,compatible_printer,paper_type,size_name,width,height,dimension_unit,updated_by,${key}) VALUES (?,?,?,?,?,?,?,?,?,?)`,[...fields,supplyId]);detailId=Number(result.insertId)}
      await q.execute(`UPDATE ${table} SET ${threshold}=? WHERE ${key}=?`,[input.threshold,supplyId])
      await audit(q,actor,'print-supply',detailId,'Supply description and alert threshold',{...before,threshold:supplies[0][threshold]},input)
      return {detailId,version:Number(before?.version??0)+1}
    })
  },
  history:(actor:number,value:unknown)=>store.read(actor,async q=>{const [rows]=await q.execute<RowDataPacket[]>('SELECT event_id,reason,before_data,after_data,created_at FROM library_maintenance_events WHERE scope=? AND record_id=? ORDER BY event_id DESC LIMIT 200',['print-supply',id(value)]);return rows}),
}}
export const supplyDetailsService=createSupplyDetailsService()
