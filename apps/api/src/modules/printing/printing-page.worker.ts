import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Uploaded PDFs are parsed in a terminable worker, without evaluating document scripts.
const require=createRequire(import.meta.url)
const distribution=path.dirname(require.resolve('pdfjs-dist/package.json'))
const task=getDocument({data:new Uint8Array(workerData),useSystemFonts:true,verbosity:0,maxImageSize:16000000,canvasMaxAreaInBytes:32000000,stopAtErrors:true,
  standardFontDataUrl:path.join(distribution,'standard_fonts').replaceAll('\\','/')+'/',
  cMapUrl:path.join(distribution,'cmaps').replaceAll('\\','/')+'/',cMapPacked:true,useWorkerFetch:false,
  wasmUrl:path.join(distribution,'wasm').replaceAll('\\','/')+'/'})
try {
  const document=await task.promise
  if(document.numPages<1||document.numPages>500)throw Error('Page limit')
  const factory=document.canvasFactory as {create(width:number,height:number):{canvas:any;context:any};destroy(surface:unknown):void}
  const pages=[]
  const imageOperations=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat,OPS.paintImageMaskXObjectRepeat,OPS.paintInlineImageXObjectGroup,OPS.paintImageMaskXObjectGroup])
  for(let number=1;number<=document.numPages;number++) {
    const page=await document.getPage(number),original=page.getViewport({scale:1})
    const scale=Math.min(.5,512/Math.max(original.width,original.height))
    if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid page dimensions')
    const viewport=page.getViewport({scale}),surface=factory.create(Math.max(1,Math.ceil(viewport.width)),Math.max(1,Math.ceil(viewport.height)))
    try {
      const operators=await page.getOperatorList()
      const hasImage=operators.fnArray.some(operation=>imageOperations.has(operation))
      const hasGraphics=operators.fnArray.some(operation=>operation===OPS.constructPath)
      await page.render({canvas:surface.canvas,canvasContext:surface.context as never,viewport,background:'rgb(255,255,255)'}).promise
      const pixels=surface.context.getImageData(0,0,surface.canvas.width,surface.canvas.height).data
      let colored=0,content=0
      for(let index=0;index<pixels.length;index+=4) {
        const low=Math.min(pixels[index],pixels[index+1],pixels[index+2]),high=Math.max(pixels[index],pixels[index+1],pixels[index+2])
        if(low<240)content++
        if(pixels[index+3]>128&&high-low>32&&low<230)colored++
      }
      // Presence is observable; whether a bitmap is a photo, logo or scanned text
      // needs staff review before a separate image fee is allowed.
      pages.push({page:number,hasImage,hasGraphics,hasColor:colored>=Math.max(10,content*.002),imageReview:hasImage||hasGraphics})
    } finally { factory.destroy(surface);page.cleanup() }
  }
  parentPort?.postMessage({pages,engine:'pdfjs-6.4.299-raster-v1'})
} catch { parentPort?.postMessage({error:true}) }
finally { await task.destroy() }
