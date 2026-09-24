import { HttpError } from '../../core/http-error.ts'

export type Area = { id: string; name: string; width: number; height: number; background: string | null }
export type MapObject = { id: string; areaId: string; kind: string; label: string; note: string; shelfId: number | null; x: number; y: number; width: number; height: number; rotation: number }
export type Layout = { areas: Area[]; objects: MapObject[] }
export const kinds = ['shelf','wall','entrance','exit','table','desk','chair','printing']
function invalid(message: string): never { throw new HttpError(422,'FLOOR_PLAN_INVALID',message) }
function label(value: unknown, max = 100): string {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max) invalid(`Enter text between 1 and ${max} characters.`)
  return value.trim()
}
export function positiveId(value: unknown) { const n=Number(value); if(!Number.isSafeInteger(n)||n<1) invalid('Select a valid record.'); return n }
export function gridCount(value: unknown, label: string) { const n=Number(value); if(!Number.isSafeInteger(n)||n<1||n>12) invalid(`${label} must be between 1 and 12.`); return n }
export function gridPosition(value: unknown, label: string, fallback = 1) { if(value===undefined||value===null||value==='')return fallback;return gridCount(value,label) }
export function versionNumber(value: unknown) { if(!Number.isSafeInteger(value)||Number(value)<0) invalid('Reload the layout before saving.'); return Number(value) }
export function validateLayout(value: unknown): Layout {
  const input=value as Layout
  if(!input||!Array.isArray(input.areas)||!Array.isArray(input.objects)||!input.areas.length||input.areas.length>20||input.objects.length>1000) invalid('Use 1–20 areas and at most 1,000 objects.')
  const areaIds=new Set<string>(), objectIds=new Set<string>(), shelves=new Set<number>()
  const size=(n: number,min:number,max:number)=>{if(!Number.isFinite(n)||n<min||n>max)invalid(`Size or position must be between ${min} and ${max}.`);return n}
  const areas=input.areas.map(a=>{
    if(!a||typeof a!=='object')invalid('Each area must be a valid object.')
    const id=label(a.id); if(areaIds.has(id))invalid('Area identifiers must be unique.');areaIds.add(id)
    if(a.background!==null&&(typeof a.background!=='string'||!/^\/api\/assets\/covers\/[a-f0-9-]+\.(png|jpg|webp)$/.test(a.background)))invalid('Upload a valid background image.')
    return {id,name:label(a.name),width:size(a.width,300,10000),height:size(a.height,300,10000),background:a.background}
  })
  const objects=input.objects.map(o=>{
    if(!o||typeof o!=='object')invalid('Each map object must have a valid shape.')
    const id=label(o.id);if(objectIds.has(id))invalid('Object identifiers must be unique.');objectIds.add(id)
    const area=areas.find(a=>a.id===o.areaId);if(!area||!kinds.includes(o.kind))invalid('Choose an existing area and object type.')
    const shelfId=o.kind==='shelf'?positiveId(o.shelfId):null
    if(shelfId){if(shelves.has(shelfId))invalid('A shelf can only be placed once.');shelves.add(shelfId)}
    const width=size(o.width,10,10000),height=size(o.height,10,10000),x=size(o.x,0,area.width),y=size(o.y,0,area.height),rotation=size(o.rotation,0,359)
    const radians=rotation*Math.PI/180,bw=Math.abs(width*Math.cos(radians))+Math.abs(height*Math.sin(radians)),bh=Math.abs(width*Math.sin(radians))+Math.abs(height*Math.cos(radians))
    if(x+width/2-bw/2<-.01||y+height/2-bh/2<-.01||x+width/2+bw/2>area.width+.01||y+height/2+bh/2>area.height+.01)invalid('Keep every object inside its area, including after rotation.')
    if(typeof o.note!=='string'||o.note.length>300)invalid('Location notes must be at most 300 characters.')
    return {id,areaId:area.id,kind:o.kind,label:label(o.label),note:o.note.trim(),shelfId,x,y,width,height,rotation}
  })
  return {areas,objects}
}
export const shelfLabel=(value:unknown)=>label(value)
