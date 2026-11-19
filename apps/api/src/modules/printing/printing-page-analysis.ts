import { Worker } from 'node:worker_threads'
import type { PageFinding } from './printing-phase-one.rules.ts'
import { HttpError } from '../../core/http-error.ts'

let running=0
export async function analyzePrintPages(contents:Buffer):Promise<{pages:PageFinding[];engine:string}> {
  if(running>=2)throw new HttpError(429,'PRINT_ANALYSIS_BUSY','Document analysis is busy. Please try again shortly.')
  running++
  try {
    return await new Promise((resolve,reject)=>{
      const filename=import.meta.url.endsWith('.ts')?'./printing-page.worker.ts':'./printing-page.worker.js'
      const worker=new Worker(new URL(filename,import.meta.url),{workerData:new Uint8Array(contents),resourceLimits:{maxOldGenerationSizeMb:256}})
      let settled=false
      const finish=(error:Error|null,result?:{pages:PageFinding[];engine:string})=>{
        if(settled)return;settled=true;clearTimeout(timer);void worker.terminate()
        if(error)reject(error);else resolve(result!)
      }
      const failure=()=>new HttpError(422,'PRINT_ANALYSIS_UNAVAILABLE','The document could not be fully analyzed. Try a smaller PDF or contact the library.')
      const timer=setTimeout(()=>finish(failure()),25000)
      worker.once('message',result=>result?.error||!Array.isArray(result?.pages)?finish(failure()):finish(null,result))
      worker.once('error',()=>finish(failure()))
      worker.once('exit',()=>{if(!settled)finish(failure())})
    })
  } finally {running--}
}
