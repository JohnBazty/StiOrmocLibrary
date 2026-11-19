import { HttpError } from '../../core/http-error.ts'

export const invalidDeskFilter = () => new HttpError(422, 'DASHBOARD_FILTER_INVALID', 'Review the dashboard filters.')
export function deskFilters(query: Record<string, unknown>) {
  const text = (key: string, max = 100) => {
    const value = query[key] ?? ''
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f]/.test(value)) throw invalidDeskFilter()
    return value.trim()
  }
  const tab = text('tab') || 'overdue', department = text('department'), program = text('program'), level = text('level')
  const page = Number(text('page') || 1), days = Number(text('days') || 30), q = text('q', 80), id = text('id')
  if (!['overdue', 'holds', 'due'].includes(tab) || !['', 'SHS', 'College', 'Other'].includes(department)
    || !['', '1', '2', '3', '4', '11', '12'].includes(level) || !Number.isSafeInteger(page) || page < 1 || page > 10000
    || ![30, 90, 365].includes(days) || (id && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))))) throw invalidDeskFilter()
  return { tab, department, program, level, page, days, q, id: id ? Number(id) : null }
}
export type DeskFilters = ReturnType<typeof deskFilters>
export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
/** Same key as automatic overdue notices, including renewal boundaries. */
export const overdueReminderKeySql = (alias = 'bt') => `CASE WHEN COALESCE(${alias}.renewal_count,0)=0 THEN CONCAT('loan:',${alias}.transaction_id,':overdue') ELSE CONCAT('loan:',${alias}.transaction_id,':renewal:',${alias}.renewal_count,':overdue') END`

/** Current profile metadata is explicit; no historical enrollment snapshot is invented. */
export const academicCte = `WITH raw_people AS (
  SELECT u.user_id,u.full_name,u.school_id,u.email,COALESCE(a.role,u.user_role) role,u.account_status,a.account_status login_status,
    COALESCE(NULLIF(sp.program_strand,''),u.course_or_strand,'') raw_program,
    COALESCE(NULLIF(sp.year_grade_level,''),u.educational_level,'') raw_level,
    UPPER(REGEXP_REPLACE(COALESCE(NULLIF(sp.program_strand,''),u.course_or_strand,''),'[^a-zA-Z0-9]','','g')) normalized_program,
    UPPER(REGEXP_REPLACE(COALESCE(NULLIF(sp.year_grade_level,''),u.educational_level,''),'[^a-zA-Z0-9]','','g')) normalized_level
  FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id LEFT JOIN student_profiles sp ON sp.account_id=a.account_id
), levels AS (
  SELECT *,CASE
    WHEN normalized_level IN ('11','GRADE11','G11','GR11') THEN '11'
    WHEN normalized_level IN ('12','GRADE12','G12','GR12') THEN '12'
    WHEN normalized_level IN ('1','1ST','1STYEAR','FIRSTYEAR','YEAR1') THEN '1'
    WHEN normalized_level IN ('2','2ND','2NDYEAR','SECONDYEAR','YEAR2') THEN '2'
    WHEN normalized_level IN ('3','3RD','3RDYEAR','THIRDYEAR','YEAR3') THEN '3'
    WHEN normalized_level IN ('4','4TH','4THYEAR','FOURTHYEAR','YEAR4') THEN '4' ELSE '' END level,
    CASE normalized_program WHEN 'BACHELOROFSCIENCEININFORMATIONTECHNOLOGY' THEN 'BSIT'
      WHEN 'BACHELOROFSCIENCEINHOSPITALITYMANAGEMENT' THEN 'BSHM'
      WHEN 'BACHELOROFSCIENCEINTOURISMMANAGEMENT' THEN 'BSTM'
      WHEN 'BSIT' THEN 'BSIT' WHEN 'BSHM' THEN 'BSHM' WHEN 'BSTM' THEN 'BSTM'
      ELSE UPPER(raw_program) END program
  FROM raw_people
), people AS (
 SELECT *,CASE WHEN role<>'Student' THEN 'Other' WHEN level IN ('11','12') OR normalized_level IN ('SHS','SENIORHIGHSCHOOL') THEN 'SHS'
   WHEN program IN ('BSIT','BSHM','BSTM') OR level IN ('1','2','3','4') OR normalized_level='COLLEGE' THEN 'College' ELSE 'Other' END department
 FROM levels
)`
