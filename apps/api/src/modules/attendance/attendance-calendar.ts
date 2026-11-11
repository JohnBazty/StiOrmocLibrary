
/** Supabase poolers may use UTC despite connection startup timezone options. */
export const attendanceTodaySql=()=>"(NOW() AT TIME ZONE 'Asia/Manila')::date"
