import { env } from './env.js'

export const isPostgres = env.db.driver === 'postgres'

/** Author list aggregation — MySQL GROUP_CONCAT vs Postgres string_agg */
export function authorsAgg(alias = 'a', separator = ', ') {
  if (isPostgres) {
    return `string_agg(${alias}.author_name, '${separator}' ORDER BY ${alias}.author_order)`
  }
  return `GROUP_CONCAT(${alias}.author_name ORDER BY ${alias}.author_order SEPARATOR '${separator}')`
}

export function authorsAggDistinct(alias = 'a', separator = ', ') {
  if (isPostgres) {
    // Postgres forbids DISTINCT + ORDER BY a different expression in string_agg.
    return `string_agg(DISTINCT ${alias}.author_name, '${separator}' ORDER BY ${alias}.author_name)`
  }
  return `GROUP_CONCAT(DISTINCT ${alias}.author_name ORDER BY ${alias}.author_order SEPARATOR '${separator}')`
}

/** Generic ordered string aggregation for arbitrary expressions */
export function stringAgg(expr, separator = ', ', orderBy = null) {
  if (isPostgres) {
    const order = orderBy ? ` ORDER BY ${orderBy}` : ''
    return `string_agg((${expr})::text, '${separator}'${order})`
  }
  const order = orderBy ? ` ORDER BY ${orderBy}` : ''
  return `GROUP_CONCAT(${expr}${order} SEPARATOR '${separator}')`
}

/** Upsert: conflict target columns without schema prefix */
export function upsert(table, columnsSql, valuesSql, conflictColumns, updateSetSql) {
  if (isPostgres) {
    return `INSERT INTO ${table} (${columnsSql}) VALUES (${valuesSql})
      ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updateSetSql}`
  }
  return `INSERT INTO ${table} (${columnsSql}) VALUES (${valuesSql})
      ON DUPLICATE KEY UPDATE ${updateSetSql}`
}

/** Map MySQL VALUES(col) references used in ON DUPLICATE updates to EXCLUDED.col for Postgres */
export function excluded(column) {
  return isPostgres ? `EXCLUDED.${column}` : `VALUES(${column})`
}

export function insertIgnore(insertSql) {
  if (isPostgres) {
    return insertSql.replace(/^\s*INSERT\s+IGNORE\s+INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING'
  }
  return insertSql
}

export function dateAddDays(expr, days = 1) {
  if (isPostgres) return `(${expr})::timestamp + INTERVAL '${days} day'`
  return `DATE_ADD(${expr}, INTERVAL ${days} DAY)`
}

export function dateAddHours(expr, hours) {
  if (isPostgres) return `(${expr})::timestamp + INTERVAL '${hours} hour'`
  return `DATE_ADD(${expr}, INTERVAL ${hours} HOUR)`
}

export function currentDate() {
  return isPostgres ? 'CURRENT_DATE' : 'CURDATE()'
}

export function currentTime() {
  return isPostgres ? 'LOCALTIME' : 'CURTIME()'
}

export function formatDate(expr, mysqlFormat, pgFormat) {
  if (isPostgres) return `to_char((${expr})::timestamp, '${pgFormat}')`
  return `DATE_FORMAT(${expr}, '${mysqlFormat}')`
}

/** TIME_FORMAT / clock display helpers */
export function formatTime(expr, mysqlFormat = '%h:%i %p', pgFormat = 'HH12:MI AM') {
  if (isPostgres) return `to_char((${expr})::time, '${pgFormat}')`
  return `TIME_FORMAT(${expr}, '${mysqlFormat}')`
}

export function monthStart(expr = null) {
  const source = expr || currentDate()
  if (isPostgres) return `date_trunc('month', (${source})::timestamp)::date`
  return `DATE_FORMAT(${source}, '%Y-%m-01')`
}

export function lastDayOfMonth(expr = null) {
  const source = expr || currentDate()
  if (isPostgres) {
    return `(date_trunc('month', (${source})::timestamp) + INTERVAL '1 month - 1 day')::date`
  }
  return `LAST_DAY(${source})`
}

/** MySQL WEEKDAY() Monday=0..Sunday=6 */
export function weekday(expr) {
  if (isPostgres) return `(EXTRACT(ISODOW FROM (${expr})::timestamp) - 1)`
  return `WEEKDAY(${expr})`
}

export function hourOf(expr) {
  if (isPostgres) return `EXTRACT(HOUR FROM (${expr})::timestamp)`
  return `HOUR(${expr})`
}

export function timestampDiffSeconds(fromExpr, toExpr) {
  if (isPostgres) return `EXTRACT(EPOCH FROM ((${toExpr}) - (${fromExpr})))`
  return `TIMESTAMPDIFF(SECOND, ${fromExpr}, ${toExpr})`
}

export function sumEquals(column, value) {
  if (isPostgres) return `COUNT(*) FILTER (WHERE ${column} = '${value}')`
  return `SUM(${column} = '${value}')`
}

/** Boolean/condition sum: SUM(cond) in MySQL → COUNT(*) FILTER in Postgres */
export function sumCondition(conditionSql) {
  if (isPostgres) return `COUNT(*) FILTER (WHERE ${conditionSql})`
  return `SUM(${conditionSql})`
}

export function caseIf(conditionSql, thenSql, elseSql) {
  return `CASE WHEN ${conditionSql} THEN ${thenSql} ELSE ${elseSql} END`
}

/** ORDER BY FIELD(col, ...) compatibility */
export function fieldOrder(expr, values) {
  if (isPostgres) {
    const cases = values.map((value, index) => `WHEN ${expr} = '${value}' THEN ${index}`).join(' ')
    return `CASE ${cases} ELSE ${values.length} END`
  }
  const list = values.map((value) => `'${value}'`).join(',')
  return `FIELD(${expr}, ${list})`
}
