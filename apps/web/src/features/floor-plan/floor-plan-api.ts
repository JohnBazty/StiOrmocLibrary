import { getAccessToken } from '../auth/auth-storage'
export type Area={id:string;name:string;width:number;height:number;background:string|null}
export type MapObject={id:string;areaId:string;kind:string;label:string;note:string;shelfId:number|null;x:number;y:number;width:number;height:number;rotation:number}
export type Layout={areas:Area[];objects:MapObject[]}
export type Shelf={id:number;label:string;columnCount:number;rowCount:number;bookCount:number;researchCount:number}
export type PlanState={revision:number;layout:Layout|null;published:Layout|null;shelves:Shelf[];categories:{id:number;name:string}[];updatedAt:string|null}
export type MapBook={copyId:number;titleId:number;title:string;isbn:string|null;callNumber:string|null;coverPath:string|null;categoryName:string|null;categoryId:number|null;barcode:string;shelfLabel:string|null;shelfId:number|null;shelfColumn:number;shelfRow:number;shelfColumnCount:number;shelfRowCount:number;availability:string;author:string|null}
export type BooksResult={items:MapBook[];matches:{shelfId:number|null;count:number}[];total:number}
export type Version={id:number;createdAt:string;publishedBy:string}
export async function floorRequest<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`/api/v1/floor-plan${path}`,{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${getAccessToken()??''}`},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json().catch(()=>null)
  if(!response.ok||!payload?.success)throw new Error(payload?.message??'The floor plan could not be loaded.')
  return payload.data as T
}
