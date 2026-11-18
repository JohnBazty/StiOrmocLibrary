import { HttpError } from '../../core/http-error.ts'
export const invalid=(message:string)=>new HttpError(422,'MAINTENANCE_INVALID',message)
export function text(value:unknown,label:string,max=150,required=false){
  if(value!=null&&typeof value!=='string')throw invalid(`${label} must be text.`)
  const result=String(value??'').trim()
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result))throw invalid(`${label} contains unsupported characters.`)
  if(result.length>max||required&&!result)throw invalid(`Enter ${label.toLowerCase()} (up to ${max} characters).`)
  return result
}
export function number(value:unknown,label:string,max=99999999,decimal=2){
  if(value===''||value==null||!['string','number'].includes(typeof value))throw invalid(`Enter ${label.toLowerCase()}.`)
  const n=Number(value)
  if(!Number.isFinite(n)||n<0||n>max||Math.abs(n*10**decimal-Math.round(n*10**decimal))>0.000001)throw invalid(`Enter a valid ${label.toLowerCase()} with at most ${decimal} decimal places.`)
  return n
}
export const id=(v:unknown)=>{const n=number(v,'record reference',Number.MAX_SAFE_INTEGER,0);if(n<1)throw invalid('Choose an existing record.');return n}
export function choice<T extends string>(value:unknown,values:readonly T[],label:string):T {if(!values.includes(value as T))throw invalid(`Choose ${label}.`);return value as T}
export function localTime(value:unknown,label:string,required=true){
  if(!value&&!required)return null
  const s=text(value,label,16,true)
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))throw invalid(`Enter a valid ${label.toLowerCase()}.`)
  const instant=new Date(s+'+08:00')
  if(!Number.isFinite(instant.getTime())||new Date(instant.getTime()+28800000).toISOString().slice(0,16)!==s||instant.getTime()>Date.now())throw invalid(`${label} must be a valid past date and time in the Philippines.`)
  return instant.toISOString()
}
export function historicalInput(body:Record<string,unknown>){
  const servedAt=localTime(body.servedAt,'Service date'),paymentState=choice(body.paymentState,['Unpaid','Unverified','Confirmed'],'payment information')
  const billed=number(body.billed,'amount billed'),amountPaid=paymentState==='Unpaid'?0:number(body.amountPaid??0,'amount paid')
  const receivedAt=paymentState==='Unpaid'?null:localTime(body.receivedAt,'Payment date',false)
  const paymentMethod=text(body.paymentMethod,'Payment method',40),paymentEvidence=text(body.paymentEvidence,'Payment evidence',500)
  if(amountPaid>billed)throw invalid('Payment cannot exceed the amount billed.')
  if(paymentState==='Confirmed'&&(!receivedAt||!amountPaid||paymentEvidence.length<3||!paymentMethod))throw invalid('Confirmed payment needs its actual date, positive amount, method and supporting reference or record.')
  const optionalCount=(v:unknown,label:string)=>v==null||v===''?null:id(number(v,label,100000,0))
  return {servedAt,customerName:text(body.customerName,'Customer name',150,true),schoolId:text(body.schoolId,'Student / Faculty ID',50),reference:text(body.reference,'Reference',150),description:text(body.description,'Job description',500,true),pages:optionalCount(body.pages,'pages'),copies:optionalCount(body.copies,'copies'),printType:text(body.printType,'Print type',60),paperSize:text(body.paperSize,'Paper size',60),billed,paymentState,amountPaid,receivedAt,paymentMethod,paymentEvidence}
}
export type ItemKind='merchandise'|'printing'
export function itemInput(body:Record<string,unknown>){
  const unit=choice(body.unit,['pieces','packs','boxes','rolls','metres'],'a stock unit')
  return {name:text(body.name,'Item name',150,true),categoryId:id(body.categoryId),specifications:text(body.specifications,'Specifications',500),unit,price:number(body.price??0,'price'),threshold:number(body.threshold??0,'low-stock threshold',99999999,unit==='metres'?3:0),state:choice(body.state??'Active',['Active','Archived'],'item status')}
}
