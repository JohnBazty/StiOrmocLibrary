import {holdingsFields,validateHoldingsData,type HoldingsData} from './holdings-parser.ts'
import {cleanImportValue,retainImportCorrections,type ImportCorrection} from './holdings-cleanup.ts'
import {isValidIsbn,normalizeIsbn} from './catalog.validation.ts'
export type SheetCorrection={sheet:string;categoryId:number|null;categoryName:string|null;location:string|null}
export function correctImportDraft(original:HoldingsData,plan:SheetCorrection,clearInvalidOptional:boolean){
 const data={...original},corrections:ImportCorrection[]=[...retainImportCorrections(original.autoCorrections)]
 for(const field of holdingsFields){
  const result=cleanImportValue(field,original[field]);data[field]=result.value as never
  if(result.correction)corrections.push(result.correction)
 }
 if(!data.categoryId&&plan.categoryId){data.categoryId=plan.categoryId;corrections.push({field:'categoryName',before:original.categoryName??'',after:plan.categoryName??'',reason:'category'})}
 if(!data.location?.trim()&&plan.location){data.location=plan.location;corrections.push({field:'shelfLocation',before:original.location??'',after:plan.location,reason:'shelf'})}
 if(clearInvalidOptional){
  const fields=['isbn','publicationYear','copyrightYear'] as const
  for(const field of fields){const value=data[field];const valid=field==='isbn'?isValidIsbn(normalizeIsbn(value)):/^\d{4}$/.test(value)&&Number(value)>=1000&&Number(value)<=new Date().getFullYear()
   if(value&&!valid){corrections.push({field,before:value,after:'',reason:'invalid_optional'});data[field]=''}
  }
 }
 if(corrections.length)data.autoCorrections=corrections
 return {data,changed:JSON.stringify(data)!==JSON.stringify(original),issues:validateHoldingsData(data,true)}
}
