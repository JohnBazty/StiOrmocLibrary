import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { HttpError } from '../../core/http-error.ts'
import { validateXlsxArchive } from '../catalog/holdings-parser.ts'

export type EnrollmentData = { schoolId:string; name:string; program:string; yearLevel:string; section:string; email:string; status:'Enrolled'|'Not Enrolled'|'' }
export type EnrollmentImportRow = { sheet:string; row:number; data:EnrollmentData; errors:string[]; warnings:string[] }
export type EnrollmentFile = { fingerprint:string; rows:EnrollmentImportRow[]; errors:number; warnings:number; sheets:string[] }
const text=(value:unknown)=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ')
const header=(value:unknown)=>text(value).toLowerCase().replace(/[^a-z0-9]/g,'')
const aliases:Record<string,string[]>= {
 schoolId:['studentid','schoolid','studentnumber','idnumber'],name:['fullname','studentname','name'],
 first:['firstname','givenname'],last:['lastname','surname'],middle:['middlename'],suffix:['suffix'],
 program:['program','programstrand','course','department'],yearLevel:['level','yearlevel','yeargradelevel','gradelevel'],
 section:['section','classsection'],email:['campusemailaddress','schoolemail','emailaddress','email'],
 status:['enrollmentstatus','enrolmentstatus','status'],academicYear:['academicyear','schoolyear','sy'],term:['semester','term','termname'],
}
const bad=(message:string)=>new HttpError(422,'ENROLLMENT_FILE_INVALID',message)
function cell(value:ExcelJS.CellValue):{value:string;unsafe:boolean;numeric:boolean} {
 if(value===null||value===undefined)return {value:'',unsafe:false,numeric:false}
 if(typeof value==='object') {
  if('richText' in value)return {value:text(value.richText.map(v=>v.text).join('')),unsafe:false,numeric:false}
  return {value:'',unsafe:true,numeric:false} // Never evaluate formulas or trust cached results.
 }
 return {value:text(value),unsafe:false,numeric:typeof value==='number'}
}
export function normalizeRegistrarLevel(value:string) {
 const raw=text(value),grade=/^G(?:rade\s*)?(11|12)$/i.exec(raw),year=/^([1-5])Y[1-3]?$/i.exec(raw)
 return grade?`Grade ${grade[1]}`:year?`${year[1]}${['','st','nd','rd','th','th'][Number(year[1])]} Year`:raw
}

/** Read-only recognition. No enrollment or account is written here. */
export async function parseEnrollmentFile(file:{buffer:Buffer;originalname:string},options:{listedEnrolled:boolean;academicYear:string;termName:string;columns?:Record<string,string>}) : Promise<EnrollmentFile> {
 if(!file.buffer.length||file.buffer.length>4*1024*1024)throw bad('Choose an XLSX workbook or UTF-8 CSV up to 4 MB.')
 const workbook=new ExcelJS.Workbook()
 try {
  if(/\.xlsx$/i.test(file.originalname)) {if(file.buffer.length<22)throw bad('The workbook is incomplete.');validateXlsxArchive(file.buffer);await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)}
  else if(/\.csv$/i.test(file.originalname))await workbook.csv.read(Readable.from(file.buffer),{map:value=>String(value??''),parserOptions:{maxRows:10002}})
  else throw bad('Use XLSX or UTF-8 CSV. Password-protected files are not supported.')
 } catch(error){if(error instanceof HttpError)throw error;throw bad('The file cannot be read. Save it as an unencrypted XLSX or UTF-8 CSV.')}
 if(workbook.worksheets.length>20)throw bad('Use at most 20 sheets per file.')
 const rows:EnrollmentImportRow[]=[],sheets:string[]=[]
 for(const sheet of workbook.worksheets) {
  if(sheet.rowCount>10001||sheet.columnCount>40)throw bad('Each sheet must have at most 10,000 students and 40 columns.')
  if(!sheet.rowCount)continue
  let columns:Record<string,number>={},headerRow=0
  for(let n=1;n<=Math.min(15,sheet.rowCount);n++) {
   const candidate:Record<string,number>={}
   sheet.getRow(n).eachCell((c,i)=>{const h=header(cell(c.value).value);for(const [field,names] of Object.entries(aliases))if(names.includes(h)||options.columns?.[field]&&header(options.columns[field])===h)candidate[field]=i})
   if(candidate.schoolId&&(candidate.name||candidate.first&&candidate.last)){columns=candidate;headerRow=n;break}
  }
  if(!headerRow)throw bad(`Sheet “${sheet.name}” needs Student ID and Name, or First Name and Last Name, column headings.`)
  sheets.push(sheet.name)
  for(let n=headerRow+1;n<=sheet.rowCount;n++) {
   const source=sheet.getRow(n),values:Record<string,ReturnType<typeof cell>>={}
   for(const [field,index] of Object.entries(columns))values[field]=cell(source.getCell(index).value)
   if(!Object.values(values).some(v=>v.value||v.unsafe))continue
   const get=(field:string)=>values[field]?.value??'',errors:string[]=[],warnings:string[]=[]
   const rawStatus=get('status'),status=rawStatus==='Enrolled'?'Enrolled':rawStatus==='Not Enrolled'?'Not Enrolled':!rawStatus&&options.listedEnrolled?'Enrolled':''
   const data:EnrollmentData={schoolId:get('schoolId').toUpperCase(),name:get('name')||[get('first'),get('middle'),get('last'),get('suffix')].filter(Boolean).join(' '),program:get('program'),yearLevel:normalizeRegistrarLevel(get('yearLevel')),section:get('section'),email:get('email').toLowerCase(),status}
   if(!/^[A-Z0-9][A-Z0-9._-]{2,49}$/.test(data.schoolId))errors.push('School ID is missing or invalid.')
   if(values.schoolId?.numeric)errors.push('School ID is stored as a number. Restore its exact ID, including leading zeros, as text.')
   if(!data.name||data.name.length>200)errors.push('A student name of at most 200 characters is required.')
   if(!data.program||data.program.length>150)errors.push('A program or strand of at most 150 characters is required.')
   if(!data.yearLevel||data.yearLevel.length>50)errors.push('A year or grade level of at most 50 characters is required.')
   if(data.section.length>100)errors.push('Section must have at most 100 characters.')
   if(data.email&&!/^[^\s@]+@ormoc\.sti\.edu\.ph$/i.test(data.email))errors.push('Use a valid Ormoc school email, or leave an unavailable email blank.')
   if(!data.email)warnings.push('No school email in roster. Email ownership and Librarian identity review are still required.')
   if(!status)errors.push('Confirm the listed students are enrolled, or use Enrolled / Not Enrolled in the enrollment-status column.')
   if(options.listedEnrolled&&rawStatus&&status!=='Enrolled')errors.push('The status conflicts with the declaration that everyone listed is enrolled.')
   if(get('academicYear')&&get('academicYear').replace(/[–—]/g,'-')!==options.academicYear)errors.push('The school year differs from the selected term.')
   if(get('term')&&header(get('term'))!==header(options.termName))errors.push('The semester differs from the selected term.')
   if(Object.values(values).some(v=>v.unsafe))errors.push('Formula, date or unsupported cell found in a required column. Use plain values.')
   rows.push({sheet:sheet.name,row:n,data,errors,warnings})
   if(rows.length>10000)throw bad('Import at most 10,000 students at a time.')
  }
 }
 if(!rows.length)throw bad('No student rows were found.')
 const byId=new Map<string,EnrollmentImportRow[]>()
 for(const row of rows){const group=byId.get(row.data.schoolId)??[];group.push(row);byId.set(row.data.schoolId,group)}
 for(const group of byId.values())if(group.length>1)for(const row of group)row.errors.push('Duplicate School ID in this file. Keep one authoritative row.')
 return {fingerprint:createHash('sha256').update(file.buffer).digest('hex'),rows,errors:rows.filter(r=>r.errors.length).length,warnings:rows.filter(r=>r.warnings.length).length,sheets}
}
