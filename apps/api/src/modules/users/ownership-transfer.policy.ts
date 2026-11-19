import {createHmac,timingSafeEqual} from 'node:crypto'
import {env} from '../../config/env.js'
import {HttpError} from '../../core/http-error.ts'
import {isInstitutionalEmail} from '../auth/auth.validation.js'

export function normalizeOwnerEmail(value:unknown){
 const email=typeof value==='string'?value.trim().toLowerCase():''
 if(email.length>191||!isInstitutionalEmail(email)||!email.endsWith('@ormoc.sti.edu.ph'))throw new HttpError(422,'OWNER_EMAIL_INVALID','Enter the new administrator’s Ormoc school Microsoft email.')
 return email
}
export const ownershipToken=(id:string,version:number)=>createHmac('sha256',env.jwt.secret).update(`ownership-setup:v1:${id}:${version}`).digest('hex')
export const ownershipDigest=(id:string,token:string)=>createHmac('sha256',env.jwt.secret).update(`ownership-grant:v1:${id}:${token}`).digest('hex')
export const matchesOwnershipToken=(stored:string,id:string,token:string)=>/^[a-f0-9]{64}$/.test(stored)&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(ownershipDigest(id,token),'hex'))
export function ownershipSetupUrl(id:string,token:string){
 const base=new URL(env.webOrigin)
 const local=process.env.NODE_ENV!=='production'&&base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)
 if((base.protocol!=='https:'&&!local)||base.username||base.password||base.search||base.hash)throw new HttpError(503,'OWNER_MAIL_CONFIG','Administrator setup email is temporarily unavailable.')
 const url=new URL('/administrator-setup',base.origin);url.hash=new URLSearchParams({invitation:id,token}).toString();return url.href
}
