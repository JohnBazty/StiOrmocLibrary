import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '../../components/ui'
import type { Area, MapObject, Shelf } from './floor-plan-api'

export function FloorMap({area,objects,shelves,selectedId,highlighted,focused,editable=false,onSelect,onChange}:{area:Area;objects:MapObject[];shelves:Shelf[];selectedId:string|null;highlighted:Set<number>;focused?:{shelfId:number;column:number;row:number}|null;editable?:boolean;onSelect:(id:string|null)=>void;onChange?:(object:MapObject)=>void}){
  const svg=useRef<SVGSVGElement>(null)
  const [view,setView]=useState({x:0,y:0,w:area.width,h:area.height})
  const drag=useRef<{mode:string;start:{x:number;y:number};object?:MapObject;view:typeof view}|null>(null)
  const [temporary,setTemporary]=useState<MapObject|null>(null)
  useEffect(()=>{setView({x:0,y:0,w:area.width,h:area.height})},[area.id,area.width,area.height])
  useEffect(()=>{if(!focused)return;const target=objects.find((object)=>object.areaId===area.id&&object.shelfId===focused.shelfId);if(!target)return;const w=Math.min(area.width,Math.max(300,target.width*4)),h=w*area.height/area.width;setView({x:Math.max(0,Math.min(area.width-w,target.x+target.width/2-w/2)),y:Math.max(0,Math.min(area.height-h,target.y+target.height/2-h/2)),w,h})},[area.id,area.height,area.width,focused?.shelfId,objects])
  const point=(e:PointerEvent)=>{const p=svg.current!.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.current!.getScreenCTM()!.inverse())}
  function begin(e:PointerEvent,mode:string,object?:MapObject){e.preventDefault();e.stopPropagation();svg.current?.setPointerCapture(e.pointerId);drag.current={mode,start:point(e),object,view};if(object)onSelect(object.id)}
  function move(e:PointerEvent){const d=drag.current;if(!d)return;const p=point(e),dx=p.x-d.start.x,dy=p.y-d.start.y
    if(d.mode==='pan'){setView(v=>({...v,x:v.x-dx,y:v.y-dy}));return}
    const o=d.object!;let changed={...o}
    if(d.mode==='move'){changed.x=Math.round(Math.max(0,Math.min(area.width-o.width,o.x+dx)));changed.y=Math.round(Math.max(0,Math.min(area.height-o.height,o.y+dy)))}
    if(d.mode==='resize'){changed.width=Math.round(Math.max(20,Math.min(area.width-o.x,o.width+dx)));changed.height=Math.round(Math.max(20,Math.min(area.height-o.y,o.height+dy)))}
    if(d.mode==='rotate')changed.rotation=(Math.round((Math.atan2(p.y-o.y-o.height/2,p.x-o.x-o.width/2)*180/Math.PI+90)/15)*15+360)%360
    setTemporary(changed)
  }
  function finish(){if(temporary)onChange?.(temporary);setTemporary(null);drag.current=null}
  function zoom(factor:number){setView(v=>{const w=Math.min(area.width*3,Math.max(100,v.w*factor)),h=w*area.height/area.width;return {x:v.x+(v.w-w)/2,y:v.y+(v.h-h)/2,w,h}})}
  return <div className="overflow-hidden rounded-2xl border border-[#003399]/20 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#003399]/10 p-3"><p className="text-xs text-[#003399]/70">{editable?'Drag objects to move. Drag the square to resize or the circle to rotate.':'Drag the map to explore. Select a shelf to see its books.'}</p><div className="flex gap-1"><Button variant="secondary" aria-label="Zoom in" onClick={()=>zoom(.8)}>+</Button><Button variant="secondary" aria-label="Zoom out" onClick={()=>zoom(1.25)}>−</Button><Button variant="secondary" onClick={()=>setView({x:0,y:0,w:area.width,h:area.height})}>Reset view</Button></div></div>
    <svg ref={svg} role="group" aria-label={`${area.name} floor plan`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-[480px] w-full touch-none select-none bg-[#003399]/5 sm:h-[560px]" onPointerDown={e=>begin(e,'pan')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      <rect width={area.width} height={area.height} fill="white" stroke="#003399" strokeWidth={3}/>
      {area.background?<image href={area.background} width={area.width} height={area.height} preserveAspectRatio="xMidYMid meet"/>:null}
      {objects.filter(o=>o.areaId===area.id).map(original=>{const o=temporary?.id===original.id?temporary:original,selected=o.id===selectedId,highlight=Boolean(o.shelfId&&highlighted.has(o.shelfId)),isFocused=Boolean(o.shelfId&&focused?.shelfId===o.shelfId),shelf=shelves.find(item=>item.id===o.shelfId),columns=shelf?.columnCount??3,rows=shelf?.rowCount??5;return <g key={o.id} role="button" tabIndex={0} aria-label={`${o.label}${highlight?', matching books':''}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(o.id)}if(editable&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onChange?.({...o,x:Math.max(0,Math.min(area.width-o.width,o.x+(e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0))),y:Math.max(0,Math.min(area.height-o.height,o.y+(e.key==='ArrowUp'?-5:e.key==='ArrowDown'?5:0)))})}}} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.width/2} ${o.height/2})`} onPointerDown={e=>{if(editable)begin(e,'move',o);else e.stopPropagation()}} onClick={e=>{if(!editable){e.stopPropagation();onSelect(o.id)}}} className={`cursor-pointer outline-none focus:opacity-70 ${isFocused?'animate-[pulse_1s_ease-in-out_3]':''}`}>
        <title>{o.label}{o.note?` — ${o.note}`:''}</title>
        <rect width={o.width} height={o.height} rx={o.kind==='wall'?0:6} fill={selected||highlight?'#FFF200':o.kind==='wall'?'#003399':'#FFFFFF'} stroke="#003399" strokeWidth={selected||highlight?4:2}/>
        {o.kind==='shelf'?<>{isFocused?<rect x={(Math.min(columns,Math.max(1,focused!.column))-1)*o.width/columns} y={(Math.min(rows,Math.max(1,focused!.row))-1)*o.height/rows} width={o.width/columns} height={o.height/rows} fill="#FFF200" opacity={.9}/>:null}{Array.from({length:Math.max(0,columns-1)},(_,index)=><line key={`c${index}`} x1={o.width*(index+1)/columns} y1={0} x2={o.width*(index+1)/columns} y2={o.height} stroke="#003399" opacity={.35}/>)}{Array.from({length:Math.max(0,rows-1)},(_,index)=><line key={`r${index}`} x1={0} y1={o.height*(index+1)/rows} x2={o.width} y2={o.height*(index+1)/rows} stroke="#003399" opacity={.35}/>)}</>:null}
        <text x={o.width/2} y={o.height/2} textAnchor="middle" dominantBaseline="central" fill={o.kind==='wall'&&!selected?'white':'#003399'} fontSize={Math.min(16,Math.max(8,o.width/Math.max(o.label.length,.1)*1.2))} fontWeight="bold">{o.label}</text>
        {editable&&selected?<><rect x={o.width-7} y={o.height-7} width={14} height={14} fill="#003399" stroke="white" onPointerDown={e=>begin(e,'resize',o)}/><line x1={o.width/2} y1={0} x2={o.width/2} y2={-24} stroke="#003399"/><circle cx={o.width/2} cy={-24} r={9} fill="#FFF200" stroke="#003399" onPointerDown={e=>begin(e,'rotate',o)}/></>:null}
      </g>})}
    </svg>
    <p className="px-4 py-2 text-xs text-[#003399]/65">Yellow outline/fill: selected shelf or matching book location.</p>
  </div>
}
