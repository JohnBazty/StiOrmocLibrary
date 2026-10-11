import { currentDate as databaseDate, isPostgres } from '../../config/sql-dialect.js'

/** Supabase poolers may use UTC despite connection startup timezone options. */
export const attendanceTodaySql=()=>isPostgres?"(NOW() AT TIME ZONE 'Asia/Manila')::date":databaseDate()
