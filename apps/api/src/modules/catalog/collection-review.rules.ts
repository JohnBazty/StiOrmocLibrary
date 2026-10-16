export type AgeStatus='Updated'|'Outdated'|'Unknown'|'Future'
export function collectionAge(year:unknown,referenceYear:number):{age:number|null;ageStatus:AgeStatus}{
 if(year==null||year===''||!Number.isInteger(Number(year))||Number(year)<1000)return {age:null,ageStatus:'Unknown'}
 const age=referenceYear-Number(year)
 return {age,ageStatus:age<0?'Future':age>=5?'Outdated':'Updated'}
}
export type CollectionBook={id:number;title:string;author:string;edition:string|null;status:string;copyrightYear:number|null;publicationYear:number|null;copies:number;usableCopies:number;digitalFiles:number;digitalFileIds?:number[];programIds:number[];courseIds:number[];programNames?:string;courseNames?:string;holdings:any[];decisions:any[];loans:number;inLibraryUses:number;lastBorrowedAt:string|null}
export type Requirement={id:number;programId:number;courseId:number|null;program:string;course:string|null;countingBasis:string;minimumCount:number;minimumRecent:number;maximumAge:number;yearBasis:string;includeDigital:boolean;approved:boolean;mappingVerified:boolean;isActive:boolean;effectiveFrom:string;effectiveUntil:string|null;scopeActive?:boolean;[key:string]:any}
const workKey=(b:CollectionBook)=>`${b.title.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ')}|${b.author.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ')}`
export function evaluateRequirement(r:Requirement,books:CollectionBook[],year:number,today:string){
 const mapped=books.filter(b=>b.status==='Active'&&b.programIds.includes(r.programId)&&(r.courseId==null||b.courseIds.includes(r.courseId))&&(b.usableCopies>0||(r.includeDigital&&(b.digitalFileIds??[]).some(id=>(r.eligibleDigitalIds??[]).includes(id)))))
 const count=(items:CollectionBook[])=>r.countingBasis==='Physical copies'?items.reduce((sum,b)=>sum+b.usableCopies,0):new Set(items.map(b=>r.countingBasis==='Editions'?String(b.id):workKey(b))).size
 const recent=mapped.filter(b=>{const y=r.yearBasis==='Publication'?b.publicationYear:b.copyrightYear;const age=collectionAge(y,year).age;return age!==null&&age>=0&&age<=r.maximumAge})
 const total=count(mapped),recentCount=count(recent),missingYears=mapped.filter(b=>collectionAge(r.yearBasis==='Publication'?b.publicationYear:b.copyrightYear,year).age===null||Number(r.yearBasis==='Publication'?b.publicationYear:b.copyrightYear)>year).length
 let status='Meets configured requirement'
 if(!r.isActive)status='Retired'
 else if(!r.approved)status='Not configured'
 else if(!r.mappingVerified||r.scopeActive===false)status='Needs verification'
 else if(today<r.effectiveFrom||(r.effectiveUntil&&today>r.effectiveUntil))status='Outside effective dates'
 else if(total<r.minimumCount||recentCount<r.minimumRecent)status=missingYears&&total>=r.minimumCount&&total>=r.minimumRecent?'Needs verification':'Shortfall'
 return {...r,total,recentCount,missingYears,status,shortfall:Math.max(0,r.minimumCount-total),recentShortfall:Math.max(0,r.minimumRecent-recentCount)}
}
export function collectionPartition(book:CollectionBook,referenceYear:number){const age=collectionAge(book.copyrightYear,referenceYear);const reason=book.status!=='Active'?'Archived title':age.ageStatus==='Unknown'?'Unknown copyright year':age.ageStatus==='Future'?'Future copyright year':age.ageStatus==='Outdated'?'Outdated — review required':book.usableCopies===0&&book.digitalFiles===0?'No usable holding':'';return {...book,...age,updated:!reason,exclusionReason:reason}}
