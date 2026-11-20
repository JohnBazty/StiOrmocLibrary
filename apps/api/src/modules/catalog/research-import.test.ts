import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { createResearchImport } from './research-import.service.ts'

const abstract = 'A study of library services in a small college campus.'
const csv = [
  'Research Title,Authors,Adviser,Year,Abstract,Research Code,Program,Shelf',
  `Smart Shelves,Ana Cruz; Ben Reyes,Dr. Lim,2025,${abstract},R-001,BSIT,`,
  `Quiet Rooms,Cara Diaz,Dr. Lim,2024,${abstract},R-002,BSHM,Thesis Rack 2`,
  `,No Title,Dr. Lim,2024,too short,,BSIT,`,
].join('\n')

test('reads a research list file, checks each row and uses the default shelf where a row has none', async () => {
  const importer = createResearchImport({ createThesisEntry: async () => ({}) })
  const preview = await importer.preview({ buffer: Buffer.from(csv), originalname: 'research.csv' }, 'Thesis Rack 1')
  assert.deepEqual(preview.missingColumns, [])
  assert.equal(preview.rows.length, 3)
  const [first, second, third] = preview.rows
  assert.deepEqual(first.data.authors, ['Ana Cruz', 'Ben Reyes'])
  assert.equal(first.data.copy.shelfLocation, 'Thesis Rack 1')
  assert.equal(second.data.copy.shelfLocation, 'Thesis Rack 2')
  assert.deepEqual(first.errors, {}); assert.deepEqual(second.errors, {})
  assert.ok(third.errors.title && third.errors.abstract && third.errors.researchCode)
  assert.equal(third.line, 4)
})

test('names the required columns a file is missing', async () => {
  const importer = createResearchImport({ createThesisEntry: async () => ({}) })
  const preview = await importer.preview({ buffer: Buffer.from('Title,Year\nOnly,2024'), originalname: 'r.csv' }, '')
  assert.deepEqual(preview.missingColumns, ['Authors', 'Adviser', 'Abstract', 'Research code', 'Department or program'])
})

test('imports each row on its own: one failure (a used research code) does not stop the others', async () => {
  const created: string[] = []
  const importer = createResearchImport({ createThesisEntry: async (body: unknown) => {
    const code = (body as { researchCode: string }).researchCode
    if (code === 'R-002') throw new HttpError(409, 'RESEARCH_CODE_ALREADY_EXISTS', 'The research code is already assigned to another thesis.')
    created.push(code); return { researchRecordId: 1 }
  } })
  const preview = await importer.preview({ buffer: Buffer.from(csv), originalname: 'research.csv' }, 'Thesis Rack 1')
  const result = await importer.importRows({ rows: preview.rows.map(row => ({ line: row.line, data: row.data })) })
  assert.deepEqual(created, ['R-001'])
  assert.equal(result.imported, 1)
  assert.deepEqual(result.failed.map(item => [item.line, item.message.slice(0, 20)]), [[3, 'The research code is'], [4, 'Title is required.']])
  await assert.rejects(importer.importRows({ rows: [] }), { status: 422 })
})
