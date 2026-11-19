import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'

export const MAX_PAYMENT_PROOF_BYTES=3*1024*1024
const MAX_IMAGE_PIXELS=12_000_000,MAX_IMAGE_EDGE=6000
const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../storage/payment-proofs')
const objectName=/^payment-proofs\/[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}\.png$/
const invalid=()=>new HttpError(422,'PAYMENT_PROOF_INVALID','Choose a clear PNG or JPEG payment receipt image.')
const unavailable=()=>new HttpError(503,'PAYMENT_PROOF_STORAGE_UNAVAILABLE','Payment proof storage is unavailable. Please try again later.')

function dimensions(contents:Buffer,mime:string):[number,number]{
 if(mime==='image/png'){
  if(contents.length<24||!contents.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||contents.toString('ascii',12,16)!=='IHDR')throw invalid()
  return[contents.readUInt32BE(16),contents.readUInt32BE(20)]
 }
 if(mime!=='image/jpeg'||contents.length<4||contents[0]!==255||contents[1]!==216)throw invalid()
 let offset=2
 while(offset+3<contents.length){
  if(contents[offset++]!==255)throw invalid()
  while(contents[offset]===255)offset++
  const marker=contents[offset++]
  if(marker===0xd9||marker===0xda)break
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue
  if(offset+2>contents.length)break
  const size=contents.readUInt16BE(offset)
  if(size<2||offset+size>contents.length)throw invalid()
  if([0xc0,0xc1,0xc2].includes(marker)){
   if(size<8)throw invalid()
   return[contents.readUInt16BE(offset+5),contents.readUInt16BE(offset+3)]
  }
  offset+=size
 }
 throw invalid()
}

/** Decode bounded raster data and remove metadata; never preserve uploaded executable content or SVG. */
export async function normalizePaymentProof(file?:Express.Multer.File){
 if(!file)throw invalid()
 if(file.buffer.length>MAX_PAYMENT_PROOF_BYTES)throw new HttpError(422,'PAYMENT_PROOF_TOO_LARGE','The receipt image must not exceed 3 MB.')
 const[width,height]=dimensions(file.buffer,file.mimetype)
 if(width<1||height<1||width>MAX_IMAGE_EDGE||height>MAX_IMAGE_EDGE||width*height>MAX_IMAGE_PIXELS)throw invalid()
 let contents:Buffer
 try{
  const{createCanvas,loadImage}=await import('@napi-rs/canvas')
  const image=await loadImage(file.buffer)
  if(image.width!==width||image.height!==height)throw invalid()
  const canvas=createCanvas(width,height),context=canvas.getContext('2d')
  context.fillStyle='#ffffff';context.fillRect(0,0,width,height);context.drawImage(image,0,0)
  contents=canvas.toBuffer('image/png')
 }catch{throw invalid()}
 if(contents.length>4*1024*1024)throw new HttpError(422,'PAYMENT_PROOF_TOO_LARGE','Use a smaller receipt image.')
 return{contents,mimeType:'image/png' as const,sha256:createHash('sha256').update(contents).digest('hex')}
}

export type ProofStorage={put(key:string,contents:Buffer):Promise<void>;read(key:string):Promise<Buffer>;remove(key:string):Promise<void>}
const client=env.supabase.url&&env.supabase.secretKey?createClient(env.supabase.url,env.supabase.secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null
const bucket='payment-proofs'
async function privateBucket(){
 if(!client)throw unavailable()
 const{data,error}=await client.storage.getBucket(bucket)
 if(error||!data||data.public||(data.allowed_mime_types&&!data.allowed_mime_types.some(type=>type==='image/png'||type==='image/*'||type==='*/*')))throw unavailable()
 return client.storage.from(bucket)
}
function safeName(key:string){if(!objectName.test(key))throw new HttpError(404,'PAYMENT_PROOF_NOT_FOUND','The receipt image was not found.');return key.slice('payment-proofs/'.length)}
export const paymentProofStorage:ProofStorage={
 async put(key,contents){
  const name=safeName(key)
  if(client){const storage=await privateBucket(),{error}=await storage.upload(key,contents,{contentType:'image/png',upsert:false});if(error)throw unavailable();return}
  if(process.env.VERCEL)throw unavailable()
  await mkdir(directory,{recursive:true});await writeFile(path.join(directory,name),contents,{flag:'wx',mode:0o600})
 },
 async read(key){
  const name=safeName(key)
  if(client){const storage=await privateBucket(),{data,error}=await storage.download(key);if(error||!data)throw new HttpError(404,'PAYMENT_PROOF_NOT_FOUND','The receipt image was not found.');return Buffer.from(await data.arrayBuffer())}
  if(process.env.VERCEL)throw unavailable()
  try{const candidate=path.join(directory,name),resolved=await realpath(candidate);if(path.dirname(resolved)!==directory)throw invalid();return await readFile(resolved)}catch{throw new HttpError(404,'PAYMENT_PROOF_NOT_FOUND','The receipt image was not found.')}
 },
 async remove(key){
  const name=safeName(key)
  if(client){const storage=await privateBucket(),{error}=await storage.remove([key]);if(error)throw unavailable();return}
  if(process.env.VERCEL)throw unavailable()
  try{await unlink(path.join(directory,name))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw unavailable()}
 },
}
