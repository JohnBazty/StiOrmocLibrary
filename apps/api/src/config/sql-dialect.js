/** Lock only mandatory rows when a query also has optional LEFT JOINs. */
export function forUpdate(alias) {
  return `FOR UPDATE OF ${alias}`
}

/** Author list aggregation. */
export function authorsAgg(alias = 'a', separator = ', ') {
  return `string_agg(${alias}.author_name, '${separator}' ORDER BY ${alias}.author_order)`
}

export function authorsAggDistinct(alias = 'a', separator = ', ') {
  // Postgres forbids DISTINCT + ORDER BY a different expression in string_agg.
  return `string_agg(DISTINCT ${alias}.author_name, '${separator}' ORDER BY ${alias}.author_name)`
}

/** Generic ordered string aggregation for arbitrary expressions */
export function stringAgg(expr, separator = ', ', orderBy = null) {
  const order = orderBy ? ` ORDER BY ${orderBy}` : ''
  return `string_agg((${expr})::text, '${separator}'${order})`
}

/** Upsert: conflict target columns without schema prefix */
export function upsert(table, columnsSql, valuesSql, conflictColumns, updateSetSql) {
  return `INSERT INTO ${table} (${columnsSql}) VALUES (${valuesSql})
      ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updateSetSql}`
}

/** Column reference to the proposed row inside ON CONFLICT DO UPDATE. */
export function excluded(column) {
  return `EXCLUDED.${column}`
}

export function insertIgnore(insertSql) {
  return insertSql.replace(/^\s*INSERT\s+IGNORE\s+INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING'
}

export function dateAddDays(expr, days = 1) {
  return `(${expr})::timestamp + INTERVAL '${days} day'`
}

export function dateAddHours(expr, hours) {
  return `(${expr})::timestamp + INTERVAL '${hours} hour'`
}

export function currentDate() {
  return 'CURRENT_DATE'
}

export function currentTime() {
  return 'LOCALTIME'
}

export function formatDate(expr, _mysqlFormat, pgFormat) {
  return `to_char((${expr})::timestamp, '${pgFormat}')`
}

/** Clock display helper */
export function formatTime(expr, _mysqlFormat, pgFormat = 'FMHH12:MI AM') {
  return `to_char((${expr})::time, '${pgFormat}')`
}

export function monthStart(expr = null) {
  const source = expr || currentDate()
  return `date_trunc('month', (${source})::timestamp)::date`
}

export function lastDayOfMonth(expr = null) {
  const source = expr || currentDate()
  return `(date_trunc('month', (${source})::timestamp) + INTERVAL '1 month - 1 day')::date`
}

/** Monday=0..Sunday=6 */
export function weekday(expr) {
  return `(EXTRACT(ISODOW FROM (${expr})::timestamp) - 1)`
}

export function hourOf(expr) {
  // PostgreSQL EXTRACT accepts both TIME and TIMESTAMP. TIME cannot be cast
  // directly to TIMESTAMP, and attendance_logs.time_in is a TIME column.
  return `EXTRACT(HOUR FROM (${expr}))`
}

export function timestampDiffSeconds(fromExpr, toExpr) {
  return `EXTRACT(EPOCH FROM ((${toExpr}) - (${fromExpr})))`
}

export function sumEquals(column, value) {
  return `COUNT(*) FILTER (WHERE ${column} = '${value}')`
}

/** Boolean/condition count: COUNT(*) FILTER */
export function sumCondition(conditionSql) {
  return `COUNT(*) FILTER (WHERE ${conditionSql})`
}

export function caseIf(conditionSql, thenSql, elseSql) {
  return `CASE WHEN ${conditionSql} THEN ${thenSql} ELSE ${elseSql} END`
}

/** ORDER BY FIELD(col, ...) compatibility */
export function fieldOrder(expr, values) {
  const cases = values.map((value, index) => `WHEN ${expr} = '${value}' THEN ${index}`).join(' ')
  return `CASE ${cases} ELSE ${values.length} END`
}
