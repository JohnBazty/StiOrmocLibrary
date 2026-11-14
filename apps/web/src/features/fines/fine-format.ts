export function fineMoney(value:number){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value)}
export function fineDate(value:string|null){if(!value)return '—';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:parsed.toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'})}
export function today(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function currentMonth(){return today().slice(0,7)}
