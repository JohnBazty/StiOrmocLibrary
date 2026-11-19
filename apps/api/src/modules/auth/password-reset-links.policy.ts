import { createHmac } from 'node:crypto'
import { env } from '../../config/env.js'

export const resetLinkLifetime = 15 * 60_000
export const resetLinkToken = (id:string,version:number) => createHmac('sha256',env.jwt.secret).update(`reset-link:v1:${id}:${version}`).digest('hex')
export const resetRecipientHash = (id:string,email:string) => createHmac('sha256',env.jwt.secret).update(`reset-recipient:v1:${id}:${email.trim().toLowerCase()}`).digest('hex')

export function passwordResetUrl(id:string,token:string,origin=env.webOrigin) {
  const base=new URL(origin)
  const local=process.env.NODE_ENV!=='production'&&base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)
  if((base.protocol!=='https:'&&!local)||base.username||base.password||base.search||base.hash)throw new Error('Configure a trusted password-reset origin.')
  const link=new URL('/reset-password',base.origin)
  link.hash=new URLSearchParams({challenge:id,token}).toString()
  return link.href
}
