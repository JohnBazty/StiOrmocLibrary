import { useEffect,useId,useRef,useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Button } from '../../components/ui'

/** USB scanners enter text; cameras and uploaded labels use the same explicit preview step. */
export function DeskScanInput({label,value,onChange,onScan,disabled,qr=false}:{label:string;value:string;onChange:(value:string)=>void;onScan:(value:string)=>void;disabled:boolean;qr?:boolean}){
 const id=`desk-scan-${useId().replaceAll(':','')}`,scanner=useRef<Html5Qrcode|null>(null)
 const[scanning,setScanning]=useState(false),[error,setError]=useState('')
 const stop=async()=>{const instance=scanner.current;if(!instance)return;try{if(instance.isScanning)await instance.stop();await instance.clear()}catch{/* Camera may already be released. */}finally{scanner.current=null;setScanning(false)}}
 useEffect(()=>()=>{void stop()},[])
 const decode=async(text:string)=>{await stop();onChange(text);onScan(text)}
 const reader=async()=>{const {Html5Qrcode,Html5QrcodeSupportedFormats:F}=await import('html5-qrcode');const instance=new Html5Qrcode(id,{formatsToSupport:qr?[F.QR_CODE]:[F.CODE_128,F.CODE_39,F.EAN_13,F.EAN_8,F.QR_CODE],verbose:false});scanner.current=instance;return instance}
 const camera=async()=>{setError('');try{await stop();const instance=await reader();setScanning(true);await instance.start({facingMode:'environment'},{fps:10,qrbox:qr?{width:220,height:220}:{width:280,height:110}},text=>void decode(text),()=>{})}catch(e){await stop();setError(e instanceof Error?e.message:'Camera unavailable. Use a USB scanner or upload the label.')}}
 const image=async(file:File|undefined)=>{if(!file)return;setError('');try{await stop();const instance=await reader();const text=await instance.scanFile(file,true);await decode(text)}catch{setError('No readable code was found in this image.')}finally{await stop()}}
 return <div className="space-y-2"><label className="block text-sm font-bold">{label}<input value={value} disabled={disabled||scanning} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onScan(value)}}} placeholder={qr?'Scan user QR or paste pass code':'Scan unique copy barcode'} className="mt-2 w-full rounded-xl border border-[#003399]/20 bg-white p-3 text-[#003399]"/></label><div className="flex flex-wrap gap-2"><Button disabled={disabled||!value||scanning} variant="secondary" onClick={()=>onScan(value)}>Verify {qr?'user':'copy'}</Button><Button disabled={disabled} variant="secondary" onClick={()=>void(scanning?stop():camera())}>{scanning?'Stop camera':'Scan with camera'}</Button><label className="relative inline-flex min-h-11 items-center cursor-pointer rounded-xl border border-[#003399]/20 px-3 py-2 text-sm font-semibold">Upload code image<input type="file" accept="image/*" className="sr-only" disabled={disabled||scanning} onChange={e=>{void image(e.target.files?.[0]);e.target.value=''}}/></label></div><div id={id} className={scanning?'min-h-56':'hidden'}/>{error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}</div>
}
