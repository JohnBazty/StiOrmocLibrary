import type { NextFunction, Request, Response } from 'express'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export type PhysicalCopyMutationAction = 'archive' | 'delete'

type PhysicalCopyRow = RowDataPacket & {
  physical_copy_id: number
  material_id: number | null
  accession_number: string
  barcode: string
  circulation_material_id: number
}

type ActiveLoanRow = RowDataPacket & {
  transaction_id: number
  transaction_status: 'Borrowed' | 'Overdue'
  borrowed_at: Date | null
  due_at: Date | null
}

export type PhysicalCopyMutationTransaction = {
  action: PhysicalCopyMutationAction
  connection: PoolConnection
  copy: PhysicalCopyRow
  completed: boolean
}

function parseCopyId(value: unknown) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const copyId = Number(value)
  return Number.isSafeInteger(copyId) && copyId > 0 ? copyId : null
}

async function rollbackAndRelease(transaction: PhysicalCopyMutationTransaction) {
  if (transaction.completed) return
  transaction.completed = true
  try {
    await transaction.connection.rollback()
  } finally {
    transaction.connection.release()
  }
}

export function createPhysicalCopyMutationGuard(database: Pool = db) {
  return (action: PhysicalCopyMutationAction) => async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    const copyId = parseCopyId(request.params.copyId)
    if (copyId === null) {
      return next(new HttpError(422, 'INVALID_PHYSICAL_COPY_ID', 'Physical copy ID must be a positive integer.'))
    }

    const connection = await database.getConnection()
    const transaction: PhysicalCopyMutationTransaction = {
      action,
      connection,
      copy: null as unknown as PhysicalCopyRow,
      completed: false,
    }

    try {
      await connection.beginTransaction()

      const [copyRows] = await connection.execute<PhysicalCopyRow[]>(
        `SELECT physical_copy_id, material_id, accession_number, barcode,
                COALESCE(material_id, physical_copy_id) AS circulation_material_id
           FROM physical_copies
          WHERE physical_copy_id = ?
          LIMIT 1
          FOR UPDATE`,
        [copyId],
      )
      const copy = copyRows[0]
      if (!copy) {
        throw new HttpError(404, 'PHYSICAL_COPY_NOT_FOUND', 'The requested physical copy does not exist.', {
          physicalCopyId: copyId,
        })
      }

      const [loanRows] = await connection.execute<ActiveLoanRow[]>(
        `SELECT transaction_id, transaction_status, borrowed_at, due_at
           FROM borrow_transactions
          WHERE material_id = ?
            AND transaction_status IN ('Borrowed', 'Overdue')
          ORDER BY transaction_id DESC
          LIMIT 1
          FOR UPDATE`,
        [copy.circulation_material_id],
      )
      const activeLoan = loanRows[0]
      if (activeLoan) {
        const state = activeLoan.transaction_status.toLowerCase()
        throw new HttpError(
          422,
          'PHYSICAL_COPY_HAS_ACTIVE_LOAN',
          `Cannot ${action} copy ${copy.accession_number} because it is currently ${state}. Process its return before trying again.`,
          {
            physicalCopyId: copy.physical_copy_id,
            materialId: copy.material_id,
            accessionNumber: copy.accession_number,
            barcode: copy.barcode,
            transactionId: activeLoan.transaction_id,
            transactionStatus: activeLoan.transaction_status,
            borrowedAt: activeLoan.borrowed_at,
            dueAt: activeLoan.due_at,
          },
        )
      }

      transaction.copy = copy
      response.locals.physicalCopyMutation = transaction

      // If a downstream handler exits without explicitly committing, release
      // the row locks and roll the transaction back when the response closes.
      response.once('close', () => {
        void rollbackAndRelease(transaction)
      })

      return next()
    } catch (error) {
      await rollbackAndRelease(transaction)
      return next(error)
    }
  }
}

export async function commitPhysicalCopyMutation(transaction: PhysicalCopyMutationTransaction) {
  if (transaction.completed) throw new Error('Physical-copy transaction has already completed.')
  transaction.completed = true
  try {
    await transaction.connection.commit()
  } finally {
    transaction.connection.release()
  }
}

export async function rollbackPhysicalCopyMutation(transaction: PhysicalCopyMutationTransaction) {
  await rollbackAndRelease(transaction)
}

export function getPhysicalCopyMutationTransaction(response: Response) {
  const transaction = response.locals.physicalCopyMutation as PhysicalCopyMutationTransaction | undefined
  if (!transaction) {
    throw new HttpError(500, 'PHYSICAL_COPY_TRANSACTION_MISSING', 'Physical-copy validation transaction was not initialized.')
  }
  return transaction
}

export const physicalCopyMutationGuard = createPhysicalCopyMutationGuard()
