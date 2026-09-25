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
    return `string_agg(DISTINCT ${alias}.author_name, '${separator}' ORDER BY ${alias}.author_order)`
  }
  return `GROUP_CONCAT(DISTINCT ${alias}.author_name ORDER BY ${alias}.author_order SEPARATOR '${separator}')`
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
    // Caller must include a conflict target: … ON CONFLICT (cols) DO NOTHING
    // Prefer rewriting call sites with an explicit conflict clause.
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

export function formatDate(expr, mysqlFormat, pgFormat) {
  if (isPostgres) return `to_char(${expr}, '${pgFormat}')`
  return `DATE_FORMAT(${expr}, '${mysqlFormat}')`
}

export function timestampDiffSeconds(fromExpr, toExpr) {
  if (isPostgres) return `EXTRACT(EPOCH FROM ((${toExpr}) - (${fromExpr})))`
  return `TIMESTAMPDIFF(SECOND, ${fromExpr}, ${toExpr})`
}

export function sumEquals(column, value) {
  if (isPostgres) return `COUNT(*) FILTER (WHERE ${column} = '${value}')`
  return `SUM(${column} = '${value}')`
}

export function caseIf(conditionSql, thenSql, elseSql) {
  return `CASE WHEN ${conditionSql} THEN ${thenSql} ELSE ${elseSql} END`
}
