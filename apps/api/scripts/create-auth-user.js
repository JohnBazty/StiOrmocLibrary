import bcrypt from 'bcrypt'
import { db } from '../src/config/db.js'
import { ALL_ROLES } from '../src/modules/auth/auth.constants.js'
import { isInstitutionalEmail, normalizeEmail } from '../src/modules/auth/auth.validation.js'

function readArguments(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, '')
    const value = values[index + 1]
    if (key && value) result[key] = value
  }
  return result
}

function readHiddenPassword(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive terminal to enter the password securely.'))
      return
    }

    let password = ''
    process.stdout.write(promptText)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const finish = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdout.write('\n')
      resolve(password)
    }

    const onData = (character) => {
      if (character === '\u0003') {
        process.stdin.setRawMode(false)
        process.exit(130)
      } else if (character === '\r' || character === '\n') {
        finish()
      } else if (character === '\u0008' || character === '\u007f') {
        password = password.slice(0, -1)
      } else if (/^[\x20-\x7E]$/.test(character)) {
        password += character
      }
    }

    process.stdin.on('data', onData)
  })
}

const args = readArguments(process.argv.slice(2))
const required = ['email', 'role', 'id', 'name']
const missing = required.filter((key) => !args[key])

if (missing.length > 0) {
  console.error(`Missing required arguments: ${missing.map((key) => `--${key}`).join(', ')}`)
  console.error('Example: npm run auth:create-user -w @sti-library/api -- --email admin@ormoc.sti.edu.ph --role "System Administrator" --id ADMIN-001 --name "Campus Administrator"')
  process.exit(1)
}

const email = normalizeEmail(args.email)
if (!isInstitutionalEmail(email)) throw new Error('Email must use the @ormoc.sti.edu.ph institutional domain.')
if (!ALL_ROLES.includes(args.role)) throw new Error(`Role must be one of: ${ALL_ROLES.join(', ')}`)
if (args.education && !['Senior High School', 'College'].includes(args.education)) {
  throw new Error('Education must be either "Senior High School" or "College".')
}

const password = await readHiddenPassword('New password (8-72 characters): ')
if (password.length < 8 || password.length > 72) throw new Error('Password must contain between 8 and 72 characters.')

try {
  const [roleRows] = await db.execute('SELECT role_id FROM roles WHERE role_name = ? LIMIT 1', [args.role])
  if (!Array.isArray(roleRows) || roleRows.length === 0) throw new Error('Role seed data is missing. Run database/mysql56-schema.sql first.')

  const passwordHash = await bcrypt.hash(password, 12)
  await db.execute(
    `INSERT INTO users
      (role_id, user_role, institutional_id, school_id, full_name, email, password_hash, educational_level, course_or_strand, section, account_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
    [
      roleRows[0].role_id,
      args.role === 'System Administrator' ? 'Admin' : args.role,
      args.id,
      args.id,
      args.name,
      email,
      passwordHash,
      args.education || null,
      args.course || null,
      args.section || null,
    ],
  )
  console.log(`Created active ${args.role} account for ${email}.`)
} finally {
  await db.end()
}
