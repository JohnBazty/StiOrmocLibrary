import { HttpError } from '../../core/http-error.ts'

export function paperSizeName(value: unknown) {
  const name=String(value??'').trim().replace(/ +/g,' ')
  if(!/^[A-Za-z0-9][A-Za-z0-9 .()+×/_-]{0,59}$/.test(name))throw new HttpError(422,'PAPER_SIZE_INVALID','Enter a paper size name, such as A3+ or Legal, up to 60 characters.')
  return name
}
function whole(value: unknown,min:number,max:number,label:string) {
  const parsed=Number(value)
  if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max)throw new HttpError(422,'PAPER_CONFIGURATION_INVALID',`${label} must be a whole number between ${min} and ${max}.`)
  return parsed
}
function price(value:unknown,label:string) {
  if(!/^\d+(\.\d{1,2})?$/.test(String(value??''))||Number(value)<=0||Number(value)>1000000)throw new HttpError(422,'PAPER_PRICE_INVALID',`Enter a positive ${label} with up to two decimal places.`)
  return Number(value)
}
export function parsePaperSize(body:Record<string,unknown>,creating:boolean) {
  const name=creating?paperSizeName(body.name):undefined
  const sheets=whole(body.sheets_per_ream??500,1,10000,'Sheets per ream')
  const threshold=whole(body.low_stock_threshold_reams??2,0,10000,'Low-stock alert')
  const active=body.is_active??true
  if(typeof active!=='boolean')throw new HttpError(422,'PAPER_CONFIGURATION_INVALID','Choose whether this paper size is available for printing.')
  const width=body.width===''||body.width==null?null:Number(body.width),height=body.height===''||body.height==null?null:Number(body.height)
  if((width===null)!==(height===null)||(width!==null&&![width,height].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=10000)))throw new HttpError(422,'PAPER_DIMENSIONS_INVALID','Enter both width and height in millimetres, or leave both blank.')
  const initial=creating?whole(body.initial_reams??0,0,10000,'Initial reams'):0
  return {name,sheets,threshold,active,width,height,monochrome:price(body.monochrome_price,'monochrome price per page'),colored:price(body.colored_price,'colored price per page'),initial,unitCost:initial?price(body.unit_cost,'purchase price per ream'):0,version:creating?1:whole(body.configuration_version,1,2147483646,'Saved version')}
}
