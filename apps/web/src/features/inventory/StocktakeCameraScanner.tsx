import {useEffect,useId,useRef,useState} from 'react'
import type {Html5Qrcode} from 'html5-qrcode'
import {barcodeScanBox} from '../../components/scanner-viewport'

/** The same label must be read twice within this window before it counts. This drops blurred or half-read frames. */
const CONFIRM_WINDOW_MS=1000
/** After a label is accepted, the same label is ignored for this long so one held-up label is not counted twice. */
const REPEAT_HOLD_MS=3000
const MAX_CODE_LENGTH=100
const CONTROL_CHARACTERS=/[\u0000-\u001f\u007f]/

type Camera={id:string;label:string}
type Props={paused:boolean;onDetected:(code:string)=>void}

function cameraMessage(reason:unknown){
  const name=reason instanceof Error?reason.name:'',text=reason instanceof Error?reason.message:String(reason)
  if(typeof window!=='undefined'&&window.isSecureContext===false)return 'Cameras only work on a secure (https) page. Open the library site with https, or type the code instead.'
  if(/NotAllowed|PermissionDenied|SecurityError/i.test(name)||/permission|denied/i.test(text))return 'Camera access is blocked. Allow the camera in the address bar, then try again. You can also type the code.'
  if(/NotFound|DevicesNotFound/i.test(name)||/not found|no camera/i.test(text))return 'No camera was found on this computer. Connect a webcam, or type the code instead.'
  if(/NotReadable|TrackStart/i.test(name))return 'The camera is being used by another app. Close that app, then try again.'
  return 'The camera could not start. Try again, or type the code instead.'
}
function signalRead(){
  try{navigator.vibrate?.(60)}catch{/* Vibration is optional. */}
  try{
    const Audio=window.AudioContext;if(!Audio)return
    const context=new Audio(),tone=context.createOscillator(),volume=context.createGain()
    volume.gain.value=0.05;tone.frequency.value=880;tone.connect(volume);volume.connect(context.destination)
    tone.start();tone.stop(context.currentTime+0.12);tone.onended=()=>void context.close()
  }catch{/* Sound is optional. */}
}

/** Keeps the webcam open between items and reports each confirmed Code 128 copy label once. */
export function StocktakeCameraScanner({paused,onDetected}:Props){
  const viewportId=`stocktake-camera-${useId().replaceAll(':','')}`
  const [error,setError]=useState(''),[cameras,setCameras]=useState<Camera[]>([]),[cameraId,setCameraId]=useState(''),[attempt,setAttempt]=useState(0)
  const pausedRef=useRef(paused),detectedRef=useRef(onDetected),releasingRef=useRef<Promise<void>>(Promise.resolve())
  const pending=useRef<{text:string;at:number}|null>(null),accepted=useRef<{text:string;at:number}|null>(null)
  pausedRef.current=paused;detectedRef.current=onDetected

  useEffect(()=>{
    // The pop-up took time. Restart the hold so the book still in view is not detected again as soon as it closes.
    if(!paused&&accepted.current)accepted.current={...accepted.current,at:Date.now()}
    pending.current=null
  },[paused])

  useEffect(()=>{
    let cancelled=false,scanner:Html5Qrcode|null=null
    const release=async()=>{
      const current=scanner;scanner=null;if(!current)return
      try{if(current.isScanning)await current.stop();current.clear()}catch{/* The camera may already be released. */}
    }
    const read=(raw:string)=>{
      const text=raw.trim()
      if(pausedRef.current||!text||text.length>MAX_CODE_LENGTH||CONTROL_CHARACTERS.test(text))return
      const now=Date.now(),held=accepted.current
      if(held&&held.text===text&&now-held.at<REPEAT_HOLD_MS)return
      const first=pending.current
      if(!first||first.text!==text||now-first.at>CONFIRM_WINDOW_MS){pending.current={text,at:now};return}
      pending.current=null;accepted.current={text,at:now}
      signalRead();detectedRef.current(text)
    }
    async function begin(){
      setError('')
      await releasingRef.current
      if(cancelled)return
      try{
        const {Html5Qrcode:Reader,Html5QrcodeSupportedFormats}=await import('html5-qrcode')
        if(cancelled)return
        scanner=new Reader(viewportId,{formatsToSupport:[Html5QrcodeSupportedFormats.CODE_128],verbose:false,experimentalFeatures:{useBarCodeDetectorIfSupported:true}})
        const source:MediaTrackConstraints=cameraId?{deviceId:{exact:cameraId}}:{facingMode:'environment'}
        await scanner.start(source,{fps:10,qrbox:barcodeScanBox,videoConstraints:{...source,width:{ideal:1280},height:{ideal:720}}},read,()=>undefined)
        if(cancelled){await release();return}
        const found=await Reader.getCameras().catch(()=>[] as Camera[]);if(!cancelled)setCameras(found)
      }catch(reason){await release();if(!cancelled)setError(cameraMessage(reason))}
    }
    void begin()
    return()=>{cancelled=true;releasingRef.current=releasingRef.current.then(release,release)}
  },[viewportId,cameraId,attempt])

  return <div className="space-y-3">
    {cameras.length>1&&<label className="block text-sm font-semibold">Camera
      <select className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={cameraId||cameras[0].id} onChange={event=>setCameraId(event.target.value)}>
        {cameras.map(camera=><option key={camera.id} value={camera.id}>{camera.label||`Camera ${camera.id.slice(0,6)}`}</option>)}
      </select></label>}
    <div id={viewportId} aria-label="Live camera preview" className="camera-preview min-h-64 w-full overflow-hidden rounded-xl bg-slate-900"/>
    {error
      ?<div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        <p>{error}</p>
        <button type="button" className="min-h-11 rounded-lg border border-red-300 px-3 font-semibold" onClick={()=>setAttempt(value=>value+1)}>Try camera again</button>
      </div>
      :<p className="text-sm">Hold the copy label 20 to 30 cm from the camera, flat, with every bar inside the guide. {paused?'Scanning is paused until you finish the pop-up.':'The code is read automatically.'}</p>}
  </div>
}
