import { HttpError } from '../../core/http-error.ts'

export type OutputMode = 'Monochrome' | 'Colored' | 'Automatic'
export type PageFinding = { page: number; hasImage: boolean; hasColor: boolean; imageReview: boolean }
export type Window = { day: number; opens: string; closes: string }
export type Exception = { date: string; windows: Array<{opens:string;closes:string}>; reason: string }
export type PrintSetup = { version: number; imageFeeMono: number; imageFeeColor: number; scheduleEnabled: boolean; weekly: Window[]; exceptions: Exception[] }
const invalid = (message: string) => new HttpError(422,'PRINT_REVIEW_REQUIRED',message)
export function whole(value: unknown, name: string, maximum = 500, minimum = 1) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw invalid(`Enter a valid ${name} (${minimum}–${maximum}).`)
  return number
}
export function outputMode(value: unknown): OutputMode {
  if (!['Monochrome','Colored','Automatic'].includes(String(value))) throw invalid('Choose automatic, monochrome or colored output.')
  return value as OutputMode
}
export function amountCents(value: unknown,maximum=999999999) {
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw invalid('Enter a non-negative price with at most two decimal places.')
  const [units,fraction=''] = text.split('.'), cents = Number(units)*100+Number(fraction.padEnd(2,'0'))
  return whole(cents,'price in centavos',maximum,0)
}
function windows<T extends { opens:string;closes:string }>(rows:T[]) {
  const result=[...rows].sort((a,b)=>a.opens.localeCompare(b.opens))
  for (let i=0;i<result.length;i++) {
    const row=result[i]
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.opens) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.closes) || row.opens>=row.closes || i>0&&result[i-1].closes>row.opens) throw invalid('Use valid, non-overlapping opening times within one day.')
  }
  return result
}
export function parseSetup(body: Record<string,unknown>): PrintSetup {
  if (typeof body.scheduleEnabled!=='boolean'||!Array.isArray(body.weekly)||body.weekly.length>28||!Array.isArray(body.exceptions)||body.exceptions.length>366) throw invalid('Review the printing schedule.')
  const weekly=body.weekly.map((row:any)=>({day:whole(row?.day,'weekday',6,0),opens:String(row?.opens),closes:String(row?.closes)}))
  for(let day=0;day<7;day++)windows(weekly.filter(row=>row.day===day))
  const dates=new Set<string>()
  const exceptions=body.exceptions.map((row:any)=>{
    const date=String(row?.date),reason=String(row?.reason??'').trim()
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||dates.has(date)||!Array.isArray(row?.windows)||row.windows.length>4||reason.length>255)throw invalid('Use a real, unique exception date and valid opening times.')
    dates.add(date)
    return {date,reason,windows:windows(row.windows.map((item:any)=>({opens:String(item?.opens),closes:String(item?.closes)})))}
  })
  return {version:whole(body.version,'configuration version',2147483647),imageFeeMono:amountCents(body.imageFeeMono,10000000),imageFeeColor:amountCents(body.imageFeeColor,10000000),scheduleEnabled:body.scheduleEnabled,weekly,exceptions}
}
export function printingWindow(setup: PrintSetup, now = new Date()) {
  if(!setup.scheduleEnabled)return {open:true,nextOpening:null as string|null,reason:null as string|null}
  const local=new Date(now.getTime()+8*3600000),today=local.toISOString().slice(0,10),time=local.toISOString().slice(11,16)
  const forDay=(day:Date)=>{const date=day.toISOString().slice(0,10),exception=setup.exceptions.find(row=>row.date===date);return exception?.windows??setup.weekly.filter(row=>row.day===day.getUTCDay())}
  if(forDay(local).some(row=>row.opens<=time&&time<row.closes))return {open:true,nextOpening:null,reason:null}
  for(let offset=0;offset<380;offset++){
    const day=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+offset)),date=day.toISOString().slice(0,10)
    const next=forDay(day).filter(row=>offset>0||row.opens>time).sort((a,b)=>a.opens.localeCompare(b.opens))[0]
    if(next)return {open:false,nextOpening:`${date}T${next.opens}:00+08:00`,reason:setup.exceptions.find(row=>row.date===today)?.reason||'Printing requests are closed for the current schedule.'}
  }
  return {open:false,nextOpening:null,reason:'No printing opening is scheduled. Contact the library.'}
}
export function pageNumbers(value: unknown, count: number) {
  if(!Array.isArray(value)||value.length>count)throw invalid('Choose valid page numbers.')
  const numbers=value.map(page=>whole(page,'page number',count))
  if(new Set(numbers).size!==numbers.length)throw invalid('A page must be selected only once.')
  return numbers.sort((a,b)=>a-b)
}
export function pricePages(pages:PageFinding[],copies:number,mode:OutputMode,mono:number,color:number,setup:PrintSetup,approvedImages?:number[]) {
  const selectedImages=approvedImages===undefined?pages.filter(row=>row.hasImage&&!row.imageReview).map(row=>row.page):approvedImages
  const coloredPages=pages.filter(row=>mode==='Colored'||mode==='Automatic'&&row.hasColor).map(row=>row.page)
  const monoPages=pages.length-coloredPages.length, colored=coloredPages.length
  const base=(monoPages*mono+colored*color)*copies
  const extra=selectedImages.reduce((sum,page)=>sum+(coloredPages.includes(page)?setup.imageFeeColor:setup.imageFeeMono)*copies,0)
  const total=base+extra
  if(!Number.isSafeInteger(total)||total<=0||total>999999999)throw invalid('The calculated bill is too large. Review the pages, copies and rates.')
  return {baseCentavos:base,imageCentavos:extra,totalCentavos:total,monoPages,colorPages:colored,images:selectedImages,monoRate:mono,colorRate:color,imageFeeMono:setup.imageFeeMono,imageFeeColor:setup.imageFeeColor,settingsVersion:setup.version,mode,copies,pageCount:pages.length,coloredPages}
}
