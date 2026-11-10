import { dashboardForRole, type AuthRole } from '../auth/auth-storage'
export function catalogAuthLink(path:'/login'|'/register',search:string){
 const raw=new URLSearchParams(search).get('catalogTitleId')??'',id=Number(raw)
 return /^\d+$/.test(raw)&&Number.isSafeInteger(id)&&id>0?`${path}?catalogTitleId=${id}`:path
}
export function catalogLoginDestination(search:string,role:AuthRole){
 const raw=new URLSearchParams(search).get('catalogTitleId')??'',titleId=Number(raw)
 return /^\d+$/.test(raw)&&Number.isSafeInteger(titleId)&&titleId>0&&['Student','Faculty'].includes(role)?`/${role.toLowerCase()}/library?titleId=${titleId}&request=1`:dashboardForRole(role)
}
