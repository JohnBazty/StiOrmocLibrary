import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { emptyFunds, type FundsLedger } from './money-out.rules.ts'

export type FundsStore = { load(): Promise<FundsLedger>; save(value: FundsLedger): Promise<void> }
const directory = new URL('../../../../../output/local-payment-tests/', import.meta.url)
const file = new URL('money-out.json', directory)
export const localFundsStore: FundsStore = {
  async load() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'))
      if (value.version !== 1 || !Array.isArray(value.operations) || !Array.isArray(value.beneficiaries) || !Array.isArray(value.voids)) throw new Error('Local payment records need review.')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyFunds(); throw error }
  },
  async save(value) {
    await mkdir(directory, { recursive: true })
    const temporary = new URL('money-out-' + randomUUID() + '.tmp', directory)
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
    await rename(temporary, file)
  },
}
