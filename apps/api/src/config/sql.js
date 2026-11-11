/** Convert SQL `?` placeholders to Postgres `$1…$n`. Ignores `?` inside quoted strings. */
export function toPgPlaceholders(sql) {
  let out = ''
  let index = 0
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    if (ch === "'" && !inDouble) {
      if (inSingle && sql[i + 1] === "'") {
        out += "''"
        i += 1
        continue
      }
      inSingle = !inSingle
      out += ch
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      out += ch
      continue
    }
    if (ch === '?' && !inSingle && !inDouble) {
      index += 1
      out += `$${index}`
      continue
    }
    out += ch
  }
  return out
}
